let map;
let campus;
let stalls;
let graph;

let userMarker = null;
let routeLine = null;
let selectedStall = null;

const intro = document.getElementById("intro");
const stallPanel = document.getElementById("stall-panel");
const stallName = document.getElementById("stall-name");
const stallDescription = document.getElementById("stall-description");
const stallCategory = document.getElementById("stall-category");
const routeInfo = document.getElementById("route-info");

const dayButton = document.getElementById("day-button");
const nightButton = document.getElementById("night-button");
const closeButton = document.getElementById("close-panel");

async function loadJSON(fileName) {
  const response = await fetch(fileName);

  if (!response.ok) {
    throw new Error(`Could not load ${fileName}`);
  }

  return response.json();
}

function distanceInMetres(pointA, pointB) {
  const earthRadius = 6371000;

  const latitude1 = pointA[0];
  const longitude1 = pointA[1];
  const latitude2 = pointB[0];
  const longitude2 = pointB[1];

  const latitudeDifference = (latitude2 - latitude1) * (Math.PI / 180);
  const longitudeDifference = (longitude2 - longitude1) * (Math.PI / 180);

  const firstPart =
    Math.sin(latitudeDifference / 2) *
    Math.sin(latitudeDifference / 2);

  const secondPart =
    Math.cos(latitude1 * (Math.PI / 180)) *
    Math.cos(latitude2 * (Math.PI / 180)) *
    Math.sin(longitudeDifference / 2) *
    Math.sin(longitudeDifference / 2);

  const value = firstPart + secondPart;

  return 2 * earthRadius * Math.asin(Math.sqrt(value));
}

function buildCampusGraph(campusData) {
  const graph = {};

  for (const nodeName in campusData.nodes) {
    graph[nodeName] = [];
  }

  campusData.paths.forEach(path => {
    const startNodeName = path[0];
    const endNodeName = path[1];

    const startPoint = campusData.nodes[startNodeName];
    const endPoint = campusData.nodes[endNodeName];

    const distance = distanceInMetres(startPoint, endPoint);

    graph[startNodeName].push({
      node: endNodeName,
      cost: distance
    });

    graph[endNodeName].push({
      node: startNodeName,
      cost: distance
    });
  });

  return graph;
}

function findShortestPath(startNodeName, endNodeName) {
  const distances = {};
  const previousNode = {};
  const unvisitedNodes = new Set(Object.keys(graph));

  for (const nodeName of unvisitedNodes) {
    distances[nodeName] = Infinity;
  }

  distances[startNodeName] = 0;

  while (unvisitedNodes.size > 0) {
    let currentNodeName = null;

    for (const nodeName of unvisitedNodes) {
      if (
        currentNodeName === null ||
        distances[nodeName] < distances[currentNodeName]
      ) {
        currentNodeName = nodeName;
      }
    }

    if (distances[currentNodeName] === Infinity) {
      break;
    }

    if (currentNodeName === endNodeName) {
      break;
    }

    unvisitedNodes.delete(currentNodeName);

    const neighbours = graph[currentNodeName];

    neighbours.forEach(neighbour => {
      const newDistance =
        distances[currentNodeName] + neighbour.cost;

      if (newDistance < distances[neighbour.node]) {
        distances[neighbour.node] = newDistance;
        previousNode[neighbour.node] = currentNodeName;
      }
    });
  }

  const routeNodes = [];
  let currentNode = endNodeName;

  while (currentNode !== undefined) {
    routeNodes.unshift(currentNode);
    currentNode = previousNode[currentNode];
  }

  if (routeNodes[0] !== startNodeName) {
    return null;
  }

  return {
    nodes: routeNodes,
    totalDistance: distances[endNodeName]
  };
}

function drawRoute(routeNodes) {
  if (routeLine) {
    map.removeLayer(routeLine);
  }

  const routePoints = routeNodes.map(nodeName => {
    return campus.nodes[nodeName];
  });

  routeLine = L.polyline(routePoints, {
    color: "#ff3b30",
    weight: 6,
    opacity: 0.9,
    dashArray: "10 10"
  }).addTo(map);

  map.fitBounds(routeLine.getBounds(), {
    padding: [60, 60]
  });
}

function findNearestNode(userLatLng) {
  let nearestNodeName = null;
  let shortestDistance = Infinity;

  for (const nodeName in campus.nodes) {
    const nodeLatLng = L.latLng(campus.nodes[nodeName]);
    const distance = userLatLng.distanceTo(nodeLatLng);

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestNodeName = nodeName;
    }
  }

  return nearestNodeName;
}

function showStall(stall) {
  selectedStall = stall;

  stallName.textContent = stall.name;
  stallDescription.textContent = stall.description;
  stallCategory.textContent = `Category: ${stall.category}`;
  routeInfo.textContent = "Finding the shortest route…";

  stallPanel.classList.remove("hidden");

  if (!userMarker) {
    routeInfo.textContent =
      "Allow location access to see the shortest route.";
    return;
  }

  const userLatLng = userMarker.getLatLng();
  const nearestNodeName = findNearestNode(userLatLng);
  const route = findShortestPath(nearestNodeName, stall.node);

  if (!route) {
    routeInfo.textContent = "No walking route is available.";
    return;
  }

  drawRoute(route.nodes);

  const walkingTimeMinutes = Math.ceil(route.totalDistance / 80);

  routeInfo.textContent =
    `Shortest route: ${Math.round(route.totalDistance)} metres` +
    ` (about ${walkingTimeMinutes} minute walk)`;
}

function updateUserLocation(latitude, longitude) {
  const userLatLng = L.latLng(latitude, longitude);

  if (!userMarker) {
    userMarker = L.circleMarker(userLatLng, {
      radius: 10,
      color: "#ffffff",
      weight: 3,
      fillColor: "#007bff",
      fillOpacity: 1
    })
      .addTo(map)
      .bindPopup("You are here");

    map.setView(userLatLng, 18);
  } else {
    userMarker.setLatLng(userLatLng);
  }

  if (selectedStall) {
    showStall(selectedStall);
  }
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    console.log("This device does not support location tracking.");
    return;
  }

  navigator.geolocation.watchPosition(
    position => {
      updateUserLocation(
        position.coords.latitude,
        position.coords.longitude
      );
    },
    error => {
      console.log("Location permission denied or unavailable.");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000
    }
  );
}

function addStallMarkers() {
  stalls.forEach(stall => {
    const stallPosition = campus.nodes[stall.node];

    const marker = L.marker(stallPosition).addTo(map);

    marker.bindPopup(
      `<strong>${stall.name}</strong><br>${stall.category}`
    );

    marker.on("click", () => {
      showStall(stall);
    });
  });
}

function setupMap() {
  const schoolBounds = L.latLngBounds(campus.mapBounds);

  map = L.map("map", {
    zoomControl: true,
    attributionControl: true
  });

  map.setView(campus.nodes["main-gate"], campus.startZoom);

  map.setMinZoom(campus.minZoom);
  map.setMaxZoom(campus.maxZoom);
  map.setMaxBounds(schoolBounds);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  L.marker(campus.nodes["main-gate"])
    .addTo(map)
    .bindPopup(
      `<strong>${campus.schoolName}</strong><br>Main Gate`
    );

  addStallMarkers();
}

dayButton.addEventListener("click", () => {
  document.body.classList.remove("night");

  dayButton.classList.add("active");
  nightButton.classList.remove("active");
});

nightButton.addEventListener("click", () => {
  document.body.classList.add("night");

  nightButton.classList.add("active");
  dayButton.classList.remove("active");
});

closeButton.addEventListener("click", () => {
  stallPanel.classList.add("hidden");

  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }

  selectedStall = null;
});

async function startApp() {
  campus = await loadJSON("campus.json");
  stalls = await loadJSON("stalls.json");

  graph = buildCampusGraph(campus);

  setupMap();
  startLocationTracking();

  setTimeout(() => {
    intro.classList.add("hidden");
  }, 4500);
}

startApp();
