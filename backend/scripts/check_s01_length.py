import json
fc = json.load(open("charge_segments.geojson"))
for f in fc["features"]:
    if f["properties"]["section_id"] == "S01":
        coords = f["geometry"]["coordinates"]
        print(f"S01 has {len(coords)} points")
        print(f"First: {coords[0]}")
        print(f"Last:  {coords[-1]}")
