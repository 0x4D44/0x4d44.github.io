from gouache import *

def peg(coat, hair, seed, h=260, mood='calm', scarf=None, skin=(233,190,160)):
    """A peg-doll cut-out: bell coat, round head, hair cap, dot eyes."""
    w = int(h*0.62)
    hr = int(h*0.2)           # head radius
    def body(d, p):
        top = p + 2*hr - 6
        d.polygon([(p+w*0.28, top+10), (p+w*0.72, top+10), (p+w*0.96, p+h), (p+w*0.04, p+h)], fill=255)
        d.ellipse([p+w*0.24, top-4, p+w*0.76, top+40], fill=255)
        d.ellipse([p+w/2-hr, p, p+w/2+hr, p+2*hr], fill=255)
    def headf(d, p):
        d.ellipse([p+w/2-hr, p, p+w/2+hr, p+2*hr], fill=255)
    def hairf(d, p):
        d.chord([p+w/2-hr-3, p-4, p+w/2+hr+3, p+2*hr-6], 180, 360, fill=255)
        d.ellipse([p+w/2-hr-3, p+hr*0.3, p+w/2-hr*0.62, p+hr*0.95], fill=255)
    def eyes(d, p):
        ey = p + hr*1.12
        for sx in (-1, 1):
            cx = p + w/2 + sx*hr*0.38
            r = hr*0.09
            if mood in ('blink', 'blinkw'):
                d.line([cx-r*1.6, ey, cx+r*1.6, ey], fill=255, width=max(3, int(r*0.9)))
                if mood == 'blinkw':
                    d.line([cx-r*3, ey-r*4.2 - sx*r*1.2, cx+r*3, ey-r*4.2 + sx*r*1.2], fill=255, width=int(r*1.1))
            elif mood == 'worried':
                d.ellipse([cx-r*1.3, ey-r*1.3, cx+r*1.3, ey+r*1.3], fill=255)
                d.line([cx-r*3, ey-r*4.2 - sx*r*1.2, cx+r*3, ey-r*4.2 + sx*r*1.2], fill=255, width=int(r*1.1))
            else:
                d.ellipse([cx-r, ey-r, cx+r, ey+r], fill=255)
    def mouth(d, p):
        my = p + hr*1.55; cx = p+w/2
        if mood in ('worried', 'blinkw'):
            d.ellipse([cx-hr*0.1, my-hr*0.05, cx+hr*0.1, my+hr*0.17], fill=255)
        elif mood in ('calm', 'blink'):
            d.arc([cx-hr*0.22, my-hr*0.2, cx+hr*0.22, my+hr*0.1], 20, 160, fill=255, width=max(3, int(hr*0.08)))
    def cheeks(d,p):
        my = p + hr*1.4
        for sx in (-1,1):
            cx = p+w/2+sx*hr*0.55
            d.ellipse([cx-hr*0.13, my-hr*0.08, cx+hr*0.13, my+hr*0.1], fill=255)
    def scarff(d, p):
        top = p + 2*hr - 6
        d.rounded_rectangle([p+w*0.22, top-2, p+w*0.78, top+26], 12, fill=255)
        d.polygon([(p+w*0.58, top+12), (p+w*0.72, top+12), (p+w*0.76, top+90), (p+w*0.6, top+86)], fill=255)
    def shade(d, p):
        top = p + 2*hr - 6
        d.polygon([(p+w*0.56, top+10), (p+w*0.72, top+10), (p+w*0.96, p+h), (p+w*0.66, p+h)], fill=255)
    dark = tuple(int(c*0.8) for c in coat)
    extra = [(shade, dark), (headf, skin), (hairf, hair)]
    if scarf: extra.append((scarff, scarf))
    extra += [(cheeks, (226,140,125), {'bloom': 4, 'alpha': 0.75}), (eyes, INK)]
    if mood: extra.append((mouth, (120, 50, 50)))
    return painted_shape(w, h, body, coat, seed, margin=5, angle=80, extra=extra)


def arm(coat, seed, h=260, skin=(233, 190, 160)):
    """A separate cut-out arm (sleeve + hand) that pivots at the shoulder."""
    L = int(h * 0.37); wd = int(h * 0.1)
    def sleeve(d, p):
        d.rounded_rectangle([p, p, p + wd, p + L - wd * 0.6], wd // 2, fill=255)
        d.ellipse([p + wd * 0.05, p + L - wd * 1.05, p + wd * 0.95, p + L - wd * 0.15], fill=255)
    def hand(d, p):
        d.ellipse([p + wd * 0.05, p + L - wd * 1.05, p + wd * 0.95, p + L - wd * 0.15], fill=255)
    dark = tuple(int(c * 0.88) for c in coat)
    spr = painted_shape(wd, L, sleeve, dark, seed, margin=4, angle=85, extra=[(hand, skin)])
    spr.pivot_d = L / 2 - wd / 2      # distance from sprite centre up to the shoulder pivot
    return spr


class Rig:
    """Body sprites per mood plus two arms; shoulder offsets relative to the body centre."""
    def __init__(self, coat, hair, seed, h=260, scarf=None):
        self.h = h
        self.moods = {m: peg(coat, hair, seed, h=h, mood=m, scarf=scarf)
                      for m in ('worried', 'calm', 'blink', 'blinkw')}
        self.arm_l = arm(coat, seed + 5, h)
        self.arm_r = arm(coat, seed + 6, h)
        w = h * 0.62
        self.shoulder = (w * 0.27, -h * 0.03)
