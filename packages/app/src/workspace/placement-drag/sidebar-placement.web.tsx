import { useIsCompactFormFactor } from "@/constants/layout";
import {
  useCallback,
  useState,
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
import type { PlacementDropTarget } from "./model";
import {
  clearPlacementHover,
  finishPlacementDrop,
  registerPlacementZone,
  updatePlacementHover,
} from "./registry.web";
import { usePlacementDrop } from "./use-placement-drop";

const newWorkspaceStyle = { display: "flex" } as const;
const workspaceStyle = { userSelect: "none" } as const;
const WorkspaceDraggingContext = createContext(false);
export function usePlacementWorkspaceDragging() {
  return useContext(WorkspaceDraggingContext);
}
const ProjectContext = createContext<SidebarProjectEntry | null>(null);
export function usePlacementWorkspaceManaged() {
  const project = useContext(ProjectContext);
  const compact = useIsCompactFormFactor();
  return project !== null && !compact;
}
export function PlacementProject({
  project,
  children,
}: {
  project: SidebarProjectEntry;
  children: ReactNode;
}) {
  return <ProjectContext value={project}>{children}</ProjectContext>;
}
function useZone(target: PlacementDropTarget | null) {
  const ref = useRef<HTMLDivElement>(null);
  const drop = usePlacementDrop();
  const latest = useRef({ target, drop });
  latest.current = { target, drop };
  const enabled = target !== null;
  useEffect(() => {
    if (!ref.current || !enabled) return;
    return registerPlacementZone({
      element: ref.current,
      get target() {
        return latest.current.target!;
      },
      drop: (source, destination) => latest.current.drop(source, destination),
    });
  }, [enabled]);
  return ref;
}
export function PlacementProjectHeader({ children }: { children: ReactNode }) {
  const project = useContext(ProjectContext);
  const ref = useZone(project ? { kind: "project", project } : null);
  return (
    <div ref={ref} data-testid={project ? `placement-project-${project.viewKey}` : undefined}>
      {children}
    </div>
  );
}
export function PlacementNewWorkspace({ children }: { children: ReactNode }) {
  const project = useContext(ProjectContext);
  const ref = useZone(project ? { kind: "new-workspace", project } : null);
  return (
    <div
      ref={ref}
      style={newWorkspaceStyle}
      data-testid={project ? `placement-new-workspace-${project.viewKey}` : undefined}
    >
      {children}
    </div>
  );
}
export function PlacementWorkspace({
  workspace,
  disabled,
  children,
}: {
  workspace: SidebarWorkspacePlacement;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [draggingWorkspace, setDraggingWorkspace] = useState(false);
  const managesPointer = usePlacementWorkspaceManaged();
  const project = useContext(ProjectContext);
  const ref = useZone({ kind: "workspace", workspace, project, after: false });
  const cleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cleanup.current?.(), []);
  const pointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !managesPointer ||
        !project ||
        disabled ||
        event.button !== 0 ||
        event.pointerType === "touch" ||
        (event.target as HTMLElement).closest(
          'button:not([data-testid^="sidebar-workspace-row-"]), input, textarea, [role="menuitem"]',
        )
      )
        return;
      cleanup.current?.();
      const start = { x: event.clientX, y: event.clientY };
      let dragging = false;
      let overlay: HTMLDivElement | undefined;
      const source = { kind: "workspace" as const, workspace };
      function move(e: PointerEvent) {
        if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        if (!dragging) {
          dragging = true;
          setDraggingWorkspace(true);
          overlay = document.createElement("div");
          overlay.textContent = workspace.name;
          Object.assign(overlay.style, {
            position: "fixed",
            pointerEvents: "none",
            zIndex: "2147483647",
            background: "#292837",
            color: "#eee",
            padding: "8px 12px",
            borderRadius: "6px",
            font: "13px sans-serif",
            boxShadow: "0 2px 12px #0005",
          });
          document.body.append(overlay);
        }
        e.preventDefault();
        if (overlay) {
          overlay.style.left = `${e.clientX + 12}px`;
          overlay.style.top = `${e.clientY + 12}px`;
        }
        updatePlacementHover(e.clientX, e.clientY, true);
      }
      function suppressClick(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
      }
      function stop() {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancel);
        document.removeEventListener("keydown", key);
        overlay?.remove();
        setDraggingWorkspace(false);
        clearPlacementHover();
        if (dragging) {
          document.addEventListener("click", suppressClick, { capture: true, once: true });
          setTimeout(() => document.removeEventListener("click", suppressClick, true), 0);
        }
        cleanup.current = undefined;
      }
      function up(e: PointerEvent) {
        if (dragging) finishPlacementDrop(source, e.clientX, e.clientY);
        stop();
      }
      function cancel() {
        stop();
      }
      function key(e: KeyboardEvent) {
        if (e.key === "Escape") {
          e.preventDefault();
          stop();
        }
      }
      document.addEventListener("pointermove", move, { passive: false });
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", cancel);
      document.addEventListener("keydown", key);
      cleanup.current = stop;
    },
    [disabled, managesPointer, project, workspace],
  );
  return (
    <WorkspaceDraggingContext value={draggingWorkspace}>
      <div
        ref={ref}
        data-testid={`placement-workspace-${workspace.workspaceKey}`}
        onPointerDownCapture={pointerDown}
        style={workspaceStyle}
      >
        {children}
      </div>
    </WorkspaceDraggingContext>
  );
}
