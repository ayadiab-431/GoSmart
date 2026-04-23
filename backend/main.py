from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from algorithms import nearest_neighbor, optimize_2opt, get_distance

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the actual origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import requests

class Errand(BaseModel):
    id: str | int
    name: str
    sub: str
    lat: float
    lng: float
    isStart: Optional[bool] = False
    priority: Optional[bool] = False

class OptimizeRequest(BaseModel):
    points: List[Errand]
    skip_optimization: Optional[bool] = False

def get_road_legs(points):
    """Fetch individual road legs between points from OSRM"""
    if not points or len(points) < 2:
        return [], 0, 0
    
    # Format: lon,lat;lon,lat;...
    coords_str = ";".join([f"{p['lng']},{p['lat']}" for p in points])
    url = f"https://routing.openstreetmap.de/routed-car/route/v1/driving/{coords_str}?overview=full&geometries=geojson&steps=false"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        data = response.json()
        
        if data['code'] == 'Ok':
            route = data['routes'][0]
            total_dist = route['distance'] / 1000
            total_time = route['duration'] / 60
            
            full_legs = []
            for i in range(len(points) - 1):
                p1, p2 = points[i], points[i+1]
                pair_url = f"https://routing.openstreetmap.de/routed-car/route/v1/driving/{p1['lng']},{p1['lat']};{p2['lng']},{p2['lat']}?overview=full&geometries=geojson"
                res = requests.get(pair_url, headers=headers, timeout=5).json()
                if res['code'] == 'Ok':
                    leg_geo = [[c[1], c[0]] for c in res['routes'][0]['geometry']['coordinates']]
                    full_legs.append({
                        "from": p1['name'],
                        "to": p2['name'],
                        "geometry": leg_geo,
                        "distance": round(res['routes'][0]['distance'] / 1000, 2),
                        "time": round(res['routes'][0]['duration'] / 60)
                    })
            return full_legs, total_dist, total_time
    except Exception as e:
        print(f"OSRM Exception: {e}")
    return [], 0, 0

@app.post("/optimize")
async def optimize_route(request: OptimizeRequest):
    if len(request.points) < 2:
        return {"path": request.points, "legs": [], "distance": 0, "time": 0}
    
    if request.skip_optimization:
        optimized_order = [p.model_dump() for p in request.points]
    else:
        # Separate points: Start, Priority, and Others
        start_point = [p.model_dump() for p in request.points if p.isStart][0]
        priority_points = [p.model_dump() for p in request.points if p.priority and not p.isStart]
        other_points = [p.model_dump() for p in request.points if not p.priority and not p.isStart]
        
        # 1. Optimize Priority Group
        current_path = [start_point]
        if priority_points:
            prio_optimized = nearest_neighbor([start_point] + priority_points)
            current_path = optimize_2opt(prio_optimized)
        
        # 2. Optimize Other Group starting from the last priority point
        if other_points:
            last_point = current_path[-1]
            others_optimized = nearest_neighbor([last_point] + other_points)
            others_optimized = optimize_2opt(others_optimized)
            current_path += others_optimized[1:] # Skip the duplicate last_point
            
        optimized_order = current_path
    
    # 3. Get segmented road legs
    legs, road_dist, road_time = get_road_legs(optimized_order)
    
    # Fallback logic...
    if not legs:
        for i in range(len(optimized_order) - 1):
            legs.append({
                "from": optimized_order[i]['name'],
                "to": optimized_order[i+1]['name'],
                "geometry": [[optimized_order[i]['lat'], optimized_order[i]['lng']], [optimized_order[i+1]['lat'], optimized_order[i+1]['lng']]],
                "distance": 0, "time": 0
            })
    
    return {
        "path": optimized_order,
        "legs": legs,
        "distance": round(road_dist, 2),
        "time": round(road_time)
    }

@app.get("/")
async def root():
    return {"status": "GoSmart Backend is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
