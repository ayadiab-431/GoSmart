import math

def get_distance(lat1, lon1, lat2, lon2):
    """Haversine formula to calculate distance between two points in km"""
    R = 6371  # Earth's radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def nearest_neighbor(points):
    """Nearest Neighbor Algorithm (TSP Heuristic)"""
    if len(points) <= 1:
        return points
    
    unvisited = points[1:]  # Keep the first point (start)
    path = [points[0]]
    
    while unvisited:
        current = path[-1]
        nearest_index = 0
        min_distance = float('inf')
        
        for i, point in enumerate(unvisited):
            dist = get_distance(current['lat'], current['lng'], point['lat'], point['lng'])
            if dist < min_distance:
                min_distance = dist
                nearest_index = i
        
        path.append(unvisited.pop(nearest_index))
        
    return path

def optimize_2opt(path):
    """2-opt Optimization for TSP path refinement"""
    best_path = list(path)
    improved = True
    
    def calculate_total_distance(p):
        total = 0
        for i in range(len(p) - 1):
            total += get_distance(p[i]['lat'], p[i]['lng'], p[i+1]['lat'], p[i+1]['lng'])
        return total

    best_distance = calculate_total_distance(best_path)

    while improved:
        improved = False
        for i in range(1, len(best_path) - 2):
            for j in range(i + 1, len(best_path) - 1):
                new_path = (best_path[:i] + 
                            best_path[i:j+1][::-1] + 
                            best_path[j+1:])
                
                new_distance = calculate_total_distance(new_path)
                
                if new_distance < best_distance:
                    best_path = new_path
                    best_distance = new_distance
                    improved = True
                    
    return best_path

def dijkstra_stub(start, end):
    """Stub for Dijkstra (returns direct distance for now)"""
    return get_distance(start['lat'], start['lng'], end['lat'], end['lng'])
