"""
Constraint solver for the base-10 timekeeping design.

Fixed:  SI second (Cesium) = 1 s.
Free knobs:
  - Earth rotation rate  -> sets day length (seconds/day)
  - Earth orbital radius  -> sets year length via Kepler (seconds/year)

Hard constraints from the brief:
  - Equatorial rotation surface speed: 1 km/s < v_rot < 1% c
  - Orbit stays in the habitable zone (HZ)
  - Orbital speed < 1% c
  - Year = one revolution; Day = one rotation; second unchanged
"""
import math

# --- physical constants (SI) ---
c          = 299_792_458.0                 # m/s
one_pct_c  = 0.01 * c                       # 2,997,924.58 m/s
R_eq       = 6_378_137.0                    # m, WGS84 equatorial radius
C_eq       = 2 * math.pi * R_eq             # equatorial circumference, m
AU         = 1.495_978_707e11              # m
GM_sun     = 1.327_124_400_18e20           # m^3/s^2
DAY_CONV   = 86_400.0                        # conventional day, s
YEAR_SID   = 365.256_363 * DAY_CONV          # sidereal year, s (Kepler-consistent)

# HZ (Kopparapu et al., the Sun), in AU
HZ_CONS = (0.95, 1.37)   # conservative (runaway greenhouse .. max greenhouse)
HZ_OPT  = (0.75, 1.77)   # optimistic (recent Venus .. early Mars)

def kepler_T(a_m):
    return 2 * math.pi * math.sqrt(a_m**3 / GM_sun)   # s

def a_from_T(T_s):
    return (GM_sun * (T_s / (2*math.pi))**2) ** (1/3)  # m

def v_orbit(a_m):
    return math.sqrt(GM_sun / a_m)                     # m/s, circular

def hz_class(a_AU):
    if HZ_CONS[0] <= a_AU <= HZ_CONS[1]: return "CONSERVATIVE"
    if HZ_OPT[0]  <= a_AU <= HZ_OPT[1]:  return "optimistic"
    return "OUTSIDE"

def insolation(a_AU):     # relative to present Earth (=1.0)
    return 1.0 / a_AU**2

# --- rotation constraint -> allowed day-length window ---
day_min = C_eq / one_pct_c
day_max = C_eq / 1000.0
print("="*72)
print("ROTATION CONSTRAINT (1 km/s < v_eq < 1% c)")
print(f"  equatorial circumference = {C_eq:,.1f} m = {C_eq/1000:,.3f} km")
print(f"  present Earth day = {DAY_CONV:,.0f} s -> v_eq = {C_eq/DAY_CONV:,.1f} m/s "
      f"({'PASS' if 1000<C_eq/DAY_CONV<one_pct_c else 'FAILS >1km/s'})")
print(f"  allowed day length: {day_min:,.3f} s  <  day  <  {day_max:,.3f} s")
print(f"                      ({day_min:,.3f} s ..  {day_max/3600:,.2f} conv-hours)")
print()

# candidate base-10-ish day lengths (seconds), mantissa x 10^k
mantissas = [1, 2, 2.5, 4, 5]
day_cands = []
for k in range(2, 6):
    for m in mantissas:
        d = m * 10**k
        if day_min < d < day_max:
            day_cands.append(d)
day_cands = sorted(set(day_cands))

def elegance(mant):   # crude: pure powers of 10 are best
    return {1:5, 2:3, 5:3, 2.5:2, 4:2}.get(mant, 1)

print("="*72)
print("CANDIDATE (day, year) COMBINATIONS  [both base-10 clean, a in HZ]")
print("="*72)
rows = []
for day in day_cands:
    # year in days: try mantissa x 10^k
    for k in range(1, 6):
        for m in mantissas:
            ydays = m * 10**k
            T = day * ydays
            a = a_from_T(T)
            a_AU = a / AU
            cls = hz_class(a_AU)
            if cls == "OUTSIDE":
                continue
            vorb = v_orbit(a)
            v_eq = C_eq / day
            score = elegance_of_day = 0
            rows.append((day, ydays, T, a_AU, cls, insolation(a_AU), v_eq, vorb))

# sort: conservative HZ first, then closeness of insolation to 1.0, then day elegance
def sort_key(r):
    day, ydays, T, a_AU, cls, ins, v_eq, vorb = r
    cls_rank = {"CONSERVATIVE":0, "optimistic":1}[cls]
    return (cls_rank, abs(math.log(ins)), -(day==10000))
rows.sort(key=sort_key)

hdr = f"{'day(s)':>8} {'yr(days)':>9} {'yr(s)':>13} {'a(AU)':>7} {'HZ':>13} {'insol':>7} {'v_eq(km/s)':>11} {'v_orb(km/s)':>12} {'day(conv h)':>11}"
print(hdr)
print("-"*len(hdr))
for r in rows[:40]:
    day, ydays, T, a_AU, cls, ins, v_eq, vorb = r
    print(f"{day:8.0f} {ydays:9.0f} {T:13.3e} {a_AU:7.3f} {cls:>13} {ins:7.3f} "
          f"{v_eq/1000:11.3f} {vorb/1000:12.3f} {day/3600:11.2f}")

print()
print("="*72)
print("DECIMAL-CLOCK HIERARCHIES for a 10,000 s day (=10^4)")
print("="*72)
day = 10000
for name, levels in [
    ("A: 10 hr x 10 x 10 x 10 s", [10,10,10,10]),
    ("B: 10 hr x 100 min x ...", [10,100,10]),
    ("C: 100 x 100 (two tiers)", [100,100]),
    ("D: metric prefixes (ks/hs/das/s)", [10,10,10,10]),
]:
    prod = 1
    for l in levels: prod*=l
    print(f"  {name:38} product={prod} {'OK' if prod==day else 'MISMATCH'}")

# sub-day unit ladder (pure powers of ten of the SI second)
print()
print("  Unit ladder (powers of 10 s):")
for k, nm in [(0,'second'),(1,'deca (10s)'),(2,'hecto (100s ~1.67min)'),
              (3,'kilo (1000s ~16.7min)'),(4,'day (10^4 s ~2.78h)')]:
    v = 10**k
    print(f"    10^{k} s = {v:>7} s = {v/60:8.3f} conv-min = {v/3600:7.4f} conv-h  [{nm}]")

# --- gravity side effect at equator for candidate days ---
print()
print("="*72)
print("EQUATORIAL EFFECTIVE-GRAVITY SIDE EFFECT")
print("="*72)
g0 = 9.780   # m/s^2 equatorial standard gravity
for day in [40000, 25000, 20000, 10000]:
    v = C_eq/day
    a_c = v*v/R_eq
    print(f"  day={day:6.0f}s  v_eq={v/1000:6.3f} km/s  centrifugal={a_c:6.3f} m/s^2  "
          f"g_eff={g0-a_c:6.3f} ({100*(g0-a_c)/g0:5.1f}% of g)")
