import type { PlacementDragSource, PlacementDropTarget } from "./model";

interface DropZone {
  element: HTMLElement;
  target: PlacementDropTarget;
  drop(source: PlacementDragSource, target: PlacementDropTarget): Promise<void>;
}
const zones = new Map<HTMLElement, DropZone>();
let hovered: HTMLElement | null = null;
let priorOutline = "";
let priorOffset = "";
let priorShadow = "";
export function registerPlacementZone(zone: DropZone) {
  zones.set(zone.element, zone);
  return () => {
    if (hovered === zone.element) clearPlacementHover();
    zones.delete(zone.element);
  };
}
export function clearPlacementHover() {
  if (hovered) {
    hovered.style.outline = priorOutline;
    hovered.style.outlineOffset = priorOffset;
    hovered.style.boxShadow = priorShadow;
    delete hovered.dataset.placementHover;
    delete hovered.dataset.placementPosition;
  }
  hovered = null;
}
function hit(x: number, y: number) {
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    const zone = zones.get(element as HTMLElement);
    if (zone) return zone;
  }
  return undefined;
}
export function updatePlacementHover(x: number, y: number, reorder = false): boolean {
  const zone = hit(x, y);
  clearPlacementHover();
  if (!zone) return false;
  hovered = zone.element;
  priorOutline = hovered.style.outline;
  priorOffset = hovered.style.outlineOffset;
  priorShadow = hovered.style.boxShadow;
  hovered.style.outline = "2px solid #8881cf";
  hovered.style.outlineOffset = "-2px";
  hovered.dataset.placementHover = "true";
  if (reorder && zone.target.kind === "workspace") {
    const rect = hovered.getBoundingClientRect();
    const after = y >= rect.top + rect.height / 2;
    hovered.style.outline = priorOutline;
    hovered.style.boxShadow = `inset 0 ${after ? "-2" : "2"}px #8881cf`;
    hovered.dataset.placementPosition = after ? "after" : "before";
  }
  return true;
}
export function finishPlacementDrop(source: PlacementDragSource, x: number, y: number): boolean {
  const zone = hit(x, y);
  clearPlacementHover();
  if (!zone) return false;
  const target =
    zone.target.kind === "workspace"
      ? {
          ...zone.target,
          after:
            y >=
            zone.element.getBoundingClientRect().top +
              zone.element.getBoundingClientRect().height / 2,
        }
      : zone.target;
  void zone.drop(source, target);
  return true;
}
