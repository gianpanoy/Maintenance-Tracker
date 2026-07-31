import geopandas as gpd
import sys

gdf = gpd.read_file(sys.argv[1] if len(sys.argv) > 1 else "data/mile_markers.geojson")
r50 = gdf[gdf["route"].astype(str) == "50"]
print(f"Route 50 mile marker points found: {len(r50)}")
if len(r50):
    print(f"mp range: {r50['mp'].min()} -> {r50['mp'].max()}")
    print("\nHighest 10 mp values (sorted):")
    for _, row in r50.sort_values("mp", ascending=False).head(10).iterrows():
        print(f"  mp {row['mp']}")
