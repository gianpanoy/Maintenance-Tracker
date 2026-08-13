import geopandas as gpd
import sys

gdf = gpd.read_file(sys.argv[1] if len(sys.argv) > 1 else "data/kauai_hpms_roads.geojson")
r50 = gdf[gdf["route_id"].astype(str) == "50"]
print(f"Route 50 features found: {len(r50)}")
if len(r50):
    print(f"bmp range: {r50['bmp'].min()} -> emp range max: {r50['emp'].max()}")
    print("\nAll bmp/emp pairs, sorted:")
    for _, row in r50.sort_values("bmp").iterrows():
        print(f"  {row['bmp']:>7} -> {row['emp']:>7}")
