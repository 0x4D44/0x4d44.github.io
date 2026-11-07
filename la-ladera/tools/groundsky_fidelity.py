#!/usr/bin/env python3
"""Independently audit delivered groundsky KTX2 containers and decoded pixels.

This reader does not import the packer or its mip/filter routines. It parses
each delivered file, validates it with Khronos ktx, inflates every mip, and
decodes those ASTC blocks with Arm astcenc. The level-zero images are retained
outside the repository for rendering actual delivery pixels. PNG masters are
used only as level-zero quality references.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shlex
import struct
import subprocess
import sys
import tempfile
import time
import zlib
import zstandard

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEV = ROOT / "dev/groundsky"
KTX_SIGNATURE = bytes.fromhex("ab4b5458203230bb0d0a1a0a")
ASTC_SIGNATURE = bytes.fromhex("13aba15c")
GATES = dict(rgbRmseMax=12.0, maskRgbaRmseMax=12.0, opacityRmseMax=8.0,
             normalMeanDegreesMax=8.0, seamMeanMax=8.0, seamMaxMax=80,
             transparentGutterMax=8, opaqueAlphaMin=247, metallicMax=8)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(command, log):
    log.write("$ " + shlex.join([str(x) for x in command]) + "\n")
    log.flush()
    started = time.monotonic()
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, timeout=120,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    log.write(result.stdout)
    log.write(f"[exit {result.returncode}; {time.monotonic()-started:.3f} s]\n\n")
    log.flush()
    if result.returncode:
        raise RuntimeError(f"Command exited {result.returncode}: {shlex.join([str(x) for x in command])}\n{result.stdout}")
    return result.stdout


def parse_ktx(data):
    """Independent subset: complete 2-D ASTC 4x4/6x6, Zstd or ZLIB."""
    if len(data) < 104 or data[:12] != KTX_SIGNATURE:
        raise ValueError("Missing or truncated KTX2 header")
    fields = struct.unpack_from("<13I2Q", data, 12)
    (vk, unit, width, height, depth, layers, faces, count, scheme,
     dfd_offset, dfd_length, kv_offset, kv_length, sgd_offset, sgd_length) = fields
    if vk not in (157,158,165,166) or unit != 1:
        raise ValueError("Only VK_FORMAT_ASTC_4x4/6x6_UNORM/SRGB_BLOCK with typeSize=1 is accepted")
    block=4 if vk in (157,158) else 6
    if not width or not height or depth or layers or faces != 1 or scheme not in (2,3):
        raise ValueError("Expected one 2-D image and KTX2 Zstd(2) or ZLIB(3) supercompression")
    if width>4096 or height>1024 or width&(width-1) or height&(height-1):
        raise ValueError("Dimensions are outside the fixed groundsky power-of-two envelope")
    if count != max(width, height).bit_length():
        raise ValueError("The full mip chain down to 1x1 must be supplied")
    if len(data) < 80+24*count:
        raise ValueError("Truncated mip level index")
    for off, length, name in [(dfd_offset,dfd_length,"DFD"),(kv_offset,kv_length,"KVD")]:
        if off < 80+24*count or length <= 0 or off+length > len(data):
            raise ValueError(f"Invalid {name} range")
    if sgd_offset or sgd_length:
        raise ValueError("Unexpected global supercompression data for Zstd/ZLIB")
    ranges = [(0,80+24*count),(dfd_offset,dfd_offset+dfd_length),(kv_offset,kv_offset+kv_length)]
    levels = []
    for level in range(count):
        offset, encoded_size, raw_size = struct.unpack_from("<3Q", data, 80+24*level)
        w,h = max(1,width>>level),max(1,height>>level)
        expected = math.ceil(w/block)*math.ceil(h/block)*16
        if raw_size != expected:
            raise ValueError(f"Mip {level} declared ASTC block bytes differ from dimensions")
        if not encoded_size or offset < 80+24*count or offset+encoded_size > len(data):
            raise ValueError(f"Mip {level} has an invalid encoded range")
        if any(offset < end and offset+encoded_size > start for start,end in ranges):
            raise ValueError(f"Mip {level} overlaps another KTX2 range")
        ranges.append((offset,offset+encoded_size))
        encoded=data[offset:offset+encoded_size]
        if scheme==3:
            inflater = zlib.decompressobj()
            raw = inflater.decompress(encoded, expected+1)
            if len(raw)>expected or inflater.unconsumed_tail:
                raise ValueError(f"Mip {level} ZLIB stream exceeds its fixed ASTC allocation")
            raw += inflater.flush(expected+1-len(raw))
            if len(raw) != expected or not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
                raise ValueError(f"Mip {level} has invalid, trailing, or incomplete ZLIB data")
        else:
            content_size=zstandard.frame_content_size(encoded)
            if content_size not in (zstandard.CONTENTSIZE_UNKNOWN,expected):
                raise ValueError(f"Mip {level} Zstd frame content size differs from ASTC allocation")
            raw=zstandard.ZstdDecompressor().decompress(encoded,max_output_size=expected,allow_extra_data=False)
            if len(raw)!=expected:
                raise ValueError(f"Mip {level} Zstd inflated size differs from ASTC allocation")
        levels.append(dict(level=level,width=w,height=h,raw=raw,encodedBytes=encoded_size))
    return dict(vkFormat=vk,width=width,height=height,blockSize=[block,block],
                supercompression=scheme,levels=levels)


def astc_header(width,height,block):
    return (ASTC_SIGNATURE + bytes([block,block,1]) + width.to_bytes(3,"little")
            + height.to_bytes(3,"little") + (1).to_bytes(3,"little"))


def rmse(a,b,weights=None):
    delta=a.astype(np.float64)-b.astype(np.float64)
    if weights is None:
        return float(np.sqrt(np.mean(delta*delta)))
    w=weights.astype(np.float64)
    divisor=float(w.sum())*delta.shape[-1]
    return float(np.sqrt(np.sum(delta*delta*w[...,None])/max(divisor,1e-12)))


def measure(source,decoded,record):
    """Return numerical evidence and errors against fixed, non-overridable gates."""
    if source.shape != decoded.shape:
        raise ValueError(f"Decoded pixels have wrong shape: {decoded.shape} != {source.shape}")
    role=record["role"];kind=record["kind"]
    is_mask=role=="mask"
    alpha_is_opacity=kind in ("decal","city","haze","vegetation")
    diff=np.abs(source.astype(np.int16)-decoded.astype(np.int16))
    weights=source[...,3]/255 if alpha_is_opacity else None
    evidence=dict(rgbRmse=rmse(source[...,:3],decoded[...,:3],weights),
                  rgbaRmse=rmse(source,decoded),maxChannelError=int(diff.max()),
                  channelRmse=[rmse(source[...,i],decoded[...,i]) for i in range(4)],
                  sourceAlphaRange=[int(source[...,3].min()),int(source[...,3].max())],
                  decodedAlphaRange=[int(decoded[...,3].min()),int(decoded[...,3].max())])
    errors=[]
    if is_mask:
        if evidence["rgbaRmse"] > GATES["maskRgbaRmseMax"]:
            errors.append(f"Mask RGBA RMSE {evidence['rgbaRmse']:.4f} exceeds {GATES['maskRgbaRmseMax']}")
    elif evidence["rgbRmse"] > GATES["rgbRmseMax"]:
        errors.append(f"RGB RMSE {evidence['rgbRmse']:.4f} exceeds {GATES['rgbRmseMax']}")
    if alpha_is_opacity:
        evidence["opacityRmse"]=evidence["channelRmse"][3]
        if evidence["opacityRmse"] > GATES["opacityRmseMax"]:
            errors.append(f"Opacity RMSE {evidence['opacityRmse']:.4f} exceeds {GATES['opacityRmseMax']}")
    elif not is_mask and int(decoded[...,3].min()) < GATES["opaqueAlphaMin"]:
        errors.append("An opaque PBR texture lost opacity during compression")
    if role=="normal":
        s=source[...,:3].astype(np.float64)/127.5-1
        d=decoded[...,:3].astype(np.float64)/127.5-1
        sn=np.linalg.norm(s,axis=-1);dn=np.linalg.norm(d,axis=-1)
        cosine=np.sum(s*d,axis=-1)/np.maximum(sn*dn,1e-12)
        angles=np.degrees(np.arccos(np.clip(cosine,-1,1)))
        evidence["normal"]=dict(meanDegrees=float(angles.mean()),rmsDegrees=float(np.sqrt(np.mean(angles*angles))),
                                maxDegrees=float(angles.max()),minLength=float(dn.min()),maxLength=float(dn.max()),
                                negativeZPixels=int(np.count_nonzero(d[...,2]<0)))
        if evidence["normal"]["meanDegrees"] >= GATES["normalMeanDegreesMax"]:
            errors.append("Mean tangent-normal angular error exceeds the fixed 8 degree gate")
        if evidence["normal"]["negativeZPixels"] or evidence["normal"]["minLength"]<.5:
            errors.append("Decoded normal contains a back-facing or near-zero tangent vector")
    if role=="orm":
        evidence["metallicMaximum"]=int(decoded[...,2].max())
        if evidence["metallicMaximum"] > GATES["metallicMax"]:
            errors.append("Non-metal ground acquired metallic channel values above 8")
    # Lossy ASTC cannot promise bit-exact opposite-edge equality. Report measured
    # seam values separately from the exact seamless PNG-master guarantee.
    tiling=record.get("tiling",{})
    evidence["decodedSeams"]={}
    for axis in ("x","y"):
        if not tiling.get(axis):continue
        a=decoded[:,0,:] if axis=="x" else decoded[0,:,:]
        b=decoded[:,-1,:] if axis=="x" else decoded[-1,:,:]
        distance=np.abs(a.astype(np.int16)-b.astype(np.int16))
        row=dict(max=int(distance.max()),mean=float(distance.mean()))
        evidence["decodedSeams"][axis]=row
        if row["mean"]>GATES["seamMeanMax"] or row["max"]>GATES["seamMaxMax"]:
            errors.append(f"Decoded seam {axis} exceeds fixed mean/max gates: {row}")
    alpha=decoded[...,3]
    if kind=="city":
        evidence["topRowAlphaMax"]=int(alpha[0].max())
        evidence["softAlphaPixels"]=int(np.count_nonzero((alpha>0)&(alpha<255)))
        if evidence["topRowAlphaMax"]>GATES["transparentGutterMax"] or not evidence["softAlphaPixels"]:
            errors.append("Decoded panorama lost transparent top row or soft skyline alpha")
    if kind=="decal":
        edge=np.concatenate([alpha[0],alpha[-1],alpha[:,0],alpha[:,-1]])
        evidence["outerEdgeAlphaMax"]=int(edge.max())
        if evidence["outerEdgeAlphaMax"]>GATES["transparentGutterMax"]:
            errors.append("Decoded decal has opacity on its outer edge")
    if kind=="vegetation":
        gutters=[]
        for cell in record["cells"]:
            x,y,w,h=cell["rect"];g=cell["gutterPx"]
            tile=alpha[y:y+h,x:x+w]
            maximum=max(int(tile[:g].max()),int(tile[-g:].max()),int(tile[:,:g].max()),int(tile[:,-g:].max()))
            gutters.append(dict(id=cell["id"],maxAlpha=maximum))
            if maximum>GATES["transparentGutterMax"]:
                errors.append(f"Decoded vegetation gutter {cell['id']} has alpha {maximum} >8")
        evidence["cellGutters"]=gutters
    return evidence,errors


def source_records():
    records=[]
    for filename in ("ground-metadata.json","sky-metadata.json"):
        records.extend(json.loads((DEV/filename).read_text())["files"])
    if len(records)!=122 or len({r["path"] for r in records})!=122:
        raise ValueError("Expected exactly 122 unique source texture records")
    return records


def audit_one(record,args,scratch,log):
    relative=Path(record["path"]).relative_to("dev/groundsky/masters")
    delivery=ROOT/"assets/textures/groundsky"/relative.with_suffix(".ktx2")
    source=ROOT/record["path"]
    result=dict(id=record["id"],path=delivery.relative_to(ROOT).as_posix(),
                sourcePath=record["path"],kind=record["kind"],role=record["role"],errors=[])
    try:
        data=delivery.read_bytes()
        result["deliverySha256"]=digest(data)
        result["sourceSha256"]=digest(source.read_bytes())
        run([args.ktx,"validate","--warnings-as-errors",str(delivery)],log)
        parsed=parse_ktx(data)
        if (parsed["width"],parsed["height"])!=(record["width"],record["height"]):
            raise ValueError("Actual KTX dimensions do not match the source record")
        if (parsed["vkFormat"] in (158,166))!=(record["colourSpace"]=="srgb"):
            raise ValueError("Actual KTX colour space differs from the source record")
        if record.get("expectedBlockSize") is not None and parsed["blockSize"]!=record["expectedBlockSize"]:
            raise ValueError("Actual KTX block size differs from delivery manifest")
        result["width"]=parsed["width"];result["height"]=parsed["height"]
        result["mipCount"]=len(parsed["levels"])
        result["decodedMipCount"]=0
        result["blockSize"]=parsed["blockSize"]
        result["supercompression"]=parsed["supercompression"]
        result["gpuBytes"]=sum(len(m["raw"]) for m in parsed["levels"])
        for mip in parsed["levels"]:
            astc=scratch/"decoded-input.astc"
            png=scratch/"decoded-mip.png"
            astc.write_bytes(astc_header(mip["width"],mip["height"],parsed["blockSize"][0])+mip["raw"])
            profile="-ds" if parsed["vkFormat"] in (158,166) else "-dl"
            run([args.astcenc,profile,str(astc),str(png),"-j","2","-silent"],log)
            with Image.open(png) as image:
                image.load()
                if image.size!=(mip["width"],mip["height"]):
                    raise ValueError(f"Mip {mip['level']} decoded to wrong dimensions")
                result["decodedMipCount"]+=1
                if mip["level"]==0:
                    pixels=np.array(image.convert("RGBA"))
                    out=args.decoded/relative
                    out.parent.mkdir(parents=True,exist_ok=True)
                    # Retain the actual decoder PNG bytes, avoiding extra image edits.
                    out.write_bytes(png.read_bytes())
                    result["decodedPath"]=str(out)
                    result["decodedSha256"]=digest(out.read_bytes())
        with Image.open(source) as image:
            master=np.array(image.convert("RGBA"))
        result["quality"],result["errors"]=measure(master,pixels,record)
    except Exception as error:
        result["errors"].append(f"{type(error).__name__}: {error}")
        log.write(f"FAIL {record['id']}: {error}\n\n")
        log.flush()
    result["ok"]=not result["errors"]
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ktx",default="ktx")
    parser.add_argument("--astcenc",default="astcenc")
    parser.add_argument("--decoded",type=Path,required=True,
                        help="Scratch directory receiving actual decoded delivery level-zero PNGs")
    parser.add_argument("--only",help="Comma-separated source IDs for development; omitted means all 122")
    parser.add_argument("--out",type=Path,default=DEV/"verification",help="Log and JSON report directory")
    parser.add_argument("--label",help="Optional audit label retained in fidelity-LABEL.log/json")
    args=parser.parse_args()
    try:os.nice(max(0,19-os.getpriority(os.PRIO_PROCESS,0)))
    except (AttributeError,OSError):pass
    args.decoded=args.decoded.resolve();args.out=args.out.resolve()
    args.out.mkdir(parents=True,exist_ok=True)
    records=source_records()
    manifest_path=ROOT/"assets/models/manifest.groundsky.json"
    if manifest_path.exists():
        delivery_by_source={r["derivedFrom"]:r for r in json.loads(manifest_path.read_text())["files"] if r["format"]=="ktx2"}
        for record in records:
            delivered=delivery_by_source.get(record["path"])
            if delivered:record["expectedBlockSize"]=delivered["blockSize"]
    if args.only:
        wanted=set(args.only.split(","));records=[r for r in records if r["id"] in wanted]
        if len(records)!=len(wanted):parser.error("--only contains an unknown or duplicate source ID")
    if args.label and not re.fullmatch(r"[a-z0-9-]+",args.label):
        parser.error("--label must contain only lowercase letters, digits and hyphens")
    suffix="-"+args.label if args.label else "-partial" if args.only else ""
    log_path=args.out/f"fidelity{suffix}.log"
    report_path=args.out/f"fidelity{suffix}.json"
    start=time.monotonic()
    report=dict(version=1,utc=datetime.now(timezone.utc).isoformat(),complete=not bool(args.only),
                gates=GATES,notes=[
                    "All KTX2 mip levels are independently extracted, inflated and decoded.",
                    "Colour cutout RGB RMSE weights pixels by source opacity; opacity is tested separately.",
                    "Mask alpha is the fourth data channel, never a transparency weight.",
                    "Source tiling is exact; lossy delivery seam deltas are measured, not claimed exact.",
                    "These fixed gates catch catastrophic degradation; they do not replace visual review or native-GPU integration."],files=[])
    with log_path.open("w") as log,tempfile.TemporaryDirectory(prefix="groundsky-fidelity-") as scratch:
        log.write("Groundsky independent delivery fidelity audit\n"+report["utc"]+"\n")
        log.write("$ "+shlex.join([sys.executable,*sys.argv])+"\n")
        log.write("Fixed quality gates: "+json.dumps(GATES,sort_keys=True)+"\n\n")
        for i,record in enumerate(records):
            result=audit_one(record,args,Path(scratch),log)
            report["files"].append(result)
            label="PASS" if result["ok"] else "FAIL"
            quality=result.get("quality",{})
            line=f"{label} {i+1}/{len(records)} {record['id']}: {result.get('mipCount',0)} mips, RGB RMSE {quality.get('rgbRmse',float('nan')):.3f}"
            print(line,flush=True);log.write(line+"\n")
            for error in result["errors"]:print("  "+error,flush=True)
        # Exact source silhouettes may gain small phase-dependent ASTC differences.
        # Measure this honestly instead of assuming that source equality survives.
        report["cityPhaseAlphaDifferences"]=[]
        decoded_cities={r["id"] for r in report["files"] if r.get("decodedPath") and "quality" in r}
        if not args.only:
            for layer in ("far","middle","near"):
                if not all(f"city_{layer}_{phase}" in decoded_cities for phase in ("day","dusk","night")):
                    report["cityPhaseAlphaDifferences"].append(dict(layer=layer,skipped="One or more phase images failed to decode; do not reuse stale scratch images."))
                    continue
                phases=[np.array(Image.open(args.decoded/"city"/f"city_{layer}_{phase}.png").convert("RGBA"))[...,3]
                        for phase in ("day","dusk","night")]
                pairs=[]
                for i,j in [(0,1),(0,2),(1,2)]:
                    delta=np.abs(phases[i].astype(np.int16)-phases[j].astype(np.int16))
                    pairs.append(dict(phases=[("day","dusk","night")[i],("day","dusk","night")[j]],
                                      max=int(delta.max()),mean=float(delta.mean()),rmse=rmse(phases[i],phases[j])))
                report["cityPhaseAlphaDifferences"].append(dict(layer=layer,pairs=pairs))
        report["ok"]=all(r["ok"] for r in report["files"])
        report["fileCount"]=len(records)
        report["mipCount"]=sum(r.get("decodedMipCount",0) for r in report["files"])
        report["failedCount"]=sum(not r["ok"] for r in report["files"])
        report["elapsedSeconds"]=round(time.monotonic()-start,3)
        summary=f"FIDELITY {'OK' if report['ok'] else 'FAILED'}: {report['fileCount']} files, {report['mipCount']} mip levels, {report['failedCount']} failed"
        log.write(summary+"\n");print(summary,flush=True)
    report_path.write_text(json.dumps(report,indent=2)+"\n")
    raise SystemExit(0 if report["ok"] else 1)


if __name__=="__main__":main()
