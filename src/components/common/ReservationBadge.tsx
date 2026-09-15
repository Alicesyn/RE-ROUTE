import React from "react";
import { CalendarClock, Ticket, Footprints, CheckCircle2 } from "lucide-react";
import { ReservationInfo } from "../../types";

interface ReservationBadgeProps {
  reservation: ReservationInfo;
  compact?: boolean;
  className?: string;
}

export const ReservationBadge: React.FC<ReservationBadgeProps> = ({
  reservation,
  compact = false,
  className = "",
}) => {
  const req = reservation.requirement;
  const advanceTime = reservation.advanceTime?.trim();
  const notes = reservation.notes?.trim();

  // Color schemes and labels per requirement type
  const config = (() => {
    switch (req) {
      case "required":
        return {
          icon: Ticket,
          label: compact ? "Reserve Req." : "Reservation Required",
          badgeClass:
            "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/80",
          iconClass: "text-rose-600 dark:text-rose-400",
          dotClass: "bg-rose-500",
        };
      case "recommended":
        return {
          icon: CalendarClock,
          label: compact ? "Reserve Rec." : "Reservation Recommended",
          badgeClass:
            "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80",
          iconClass: "text-amber-600 dark:text-amber-400",
          dotClass: "bg-amber-500",
        };
      case "walk_ins_only":
        return {
          icon: Footprints,
          label: compact ? "Walk-in" : "Walk-in Only",
          badgeClass:
            "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/80",
          iconClass: "text-sky-600 dark:text-sky-400",
          dotClass: "bg-sky-500",
        };
      case "not_needed":
      default:
        return {
          icon: CheckCircle2,
          label: compact ? "No Reserve" : "No Reservation Needed",
          badgeClass:
            "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700",
          iconClass: "text-surface-400 dark:text-surface-500",
          dotClass: "bg-surface-400",
        };
    }
  })();

  const IconComponent = config.icon;

  const tooltipLines: string[] = [config.label];
  if (advanceTime) tooltipLines.push(`Timing: ${advanceTime}`);
  if (notes) tooltipLines.push(`Note: ${notes}`);
  const tooltip = tooltipLines.join("\n");

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border shadow-2xs whitespace-nowrap cursor-help transition-colors ${config.badgeClass} ${className}`}
        title={tooltip}
      >
        <IconComponent className={`w-2.5 h-2.5 shrink-0 ${config.iconClass}`} />
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 border shadow-2xs transition-colors cursor-help ${config.badgeClass} ${className}`}
      title={tooltip}
    >
      <IconComponent className={`w-3.5 h-3.5 shrink-0 ${config.iconClass}`} />
      <span className="font-semibold">{config.label}</span>
      {advanceTime && (
        <>
          <span className="opacity-40 text-xs">•</span>
          <span className="font-normal opacity-95">
            {advanceTime}
          </span>
        </>
      )}
      {notes && (
        <span className="hidden lg:inline text-[11px] opacity-75 italic">
          ({notes})
        </span>
      )}
    </div>
  );
};
