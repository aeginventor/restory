import {
  BookOpen,
  Clapperboard,
  Gamepad2,
  MonitorPlay,
  NotebookPen,
  Tv,
  PanelsTopLeft,
} from "lucide-react";
import type { MediaType } from "@/lib/types";
const icons = {
  film: Clapperboard,
  series: Tv,
  animation: MonitorPlay,
  book: BookOpen,
  comic: PanelsTopLeft,
  game: Gamepad2,
  other: NotebookPen,
};
export function WorkMark({
  type,
  large = false,
}: {
  type: MediaType;
  large?: boolean;
}) {
  const Icon = icons[type] || BookOpen;
  return (
    <span
      className={`work-mark media-${type} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <Icon size={large ? 34 : 23} strokeWidth={1.3} />
    </span>
  );
}
