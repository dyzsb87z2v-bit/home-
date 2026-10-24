"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

export type MapPoint = { id: string; lat: number; lng: number; title: string; price: string; href: string; eligibility: string; approximate: boolean };

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const COLORS: Record<string, string> = { ELIGIBLE: "#12805c", NEEDS_VERIFICATION: "#a35b00", INELIGIBLE: "#8a94a6" };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function SpandauMap({ points, boundaryLabel, attribution }: { points: MapPoint[]; boundaryLabel: string; attribution: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || OSM_STYLE,
      center: [13.17, 52.52],
      zoom: 11,
      attributionControl: { compact: true, customAttribution: attribution },
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("spandau", { type: "geojson", data: "/spandau-boundary.geojson" });
      map.addLayer({ id: "spandau-fill", type: "fill", source: "spandau", paint: { "fill-color": "#2952cc", "fill-opacity": 0.06 } });
      map.addLayer({ id: "spandau-line", type: "line", source: "spandau", paint: { "line-color": "#2952cc", "line-width": 2 } });

      map.addSource("props", {
        type: "geojson",
        cluster: true,
        clusterRadius: 40,
        data: {
          type: "FeatureCollection",
          features: points.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { ...p, color: COLORS[p.eligibility] ?? "#8a94a6" } })),
        },
      });
      map.addLayer({ id: "clusters", type: "circle", source: "props", filter: ["has", "point_count"], paint: { "circle-color": "#2952cc", "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28], "circle-opacity": 0.85 } });
      map.addLayer({ id: "cluster-count", type: "symbol", source: "props", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#ffffff" } });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "props",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": ["get", "color"], "circle-radius": 8, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-opacity": ["case", ["get", "approximate"], 0.55, 1] },
      });

      map.on("click", "clusters", async (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        if (!f) return;
        const src = map.getSource("props") as maplibregl.GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
        map.easeTo({ center: (f.geometry as { coordinates: number[] }).coordinates as [number, number], zoom });
      });
      map.on("click", "points", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as unknown as MapPoint;
        new maplibregl.Popup({ closeButton: true })
          .setLngLat((f.geometry as { coordinates: number[] }).coordinates as [number, number])
          .setHTML(`<div dir="ltr" style="font:13px system-ui;max-width:220px"><strong>${escapeHtml(p.title)}</strong><br>${escapeHtml(p.price)}<br><a href="${escapeHtml(p.href)}" style="color:#2952cc">→</a></div>`)
          .addTo(map);
      });
      for (const l of ["clusters", "points"]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
      }
    });
    return () => map.remove();
  }, [points, attribution]);

  return <div ref={ref} className="h-[65dvh] min-h-80 w-full overflow-hidden rounded-xl border border-border" role="region" aria-label={boundaryLabel} />;
}
