"""Shared projection - mirror of js/shared/geo.js. World frame: +X east, +Y up (m above OD), -Z north.
In Blender (Z-up) build with X=east, Y=north, Z=up and export glTF with +Y up; that lands in the same frame."""
import math
ORIGIN_LAT, ORIGIN_LON = 55.8600, -4.2700
M_PER_DEG_LAT = 111132.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(ORIGIN_LAT))
def project(lat, lon):
    """-> (x_east, z_world) ; world Z is negative-north. Blender Y(north) = -z_world."""
    return ((lon - ORIGIN_LON) * M_PER_DEG_LON, -(lat - ORIGIN_LAT) * M_PER_DEG_LAT)
def unproject(x, z):
    return (ORIGIN_LAT - z / M_PER_DEG_LAT, ORIGIN_LON + x / M_PER_DEG_LON)
