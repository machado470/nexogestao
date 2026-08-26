import { Button } from "@/components/ui/button";
import { useNotificationStore, getIcon, getColor } from "@/stores/notificationStore";
import { X } from "lucide-react";


export function NotificationCenter() {
  const notifications = useNotificationStore(state => state.notifications);
  const remove = useNotificationStore(state => state.remove);

  return (
    <div className="fixed right-4 top-4 z-50 max-w-md space-y-2">
      {notifications.map(notification => {
        const Icon = getIcon(notification.type);
        const colorClass = getColor(notification.type);

        return (
          <div
            key={notification.id}
            data-state="open"
            className={`nexo-floating-panel nexo-motion-panel nexo-state-transition flex items-start gap-3 rounded-[var(--radius-surface)] border p-4 ${colorClass}`}
          >
            <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{notification.title}</h3>
              {notification.description && (
                <p className="mt-1 text-sm opacity-90">{notification.description}</p>
              )}
              {notification.action && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-auto p-0 text-xs text-[var(--accent)]"
                  onClick={() => {
                    notification.action?.onClick();
                    remove(notification.id);
                  }}
                >
                  {notification.action.label}
                </Button>
              )}
            </div>

            <button
              onClick={() => remove(notification.id)}
              className="flex-shrink-0 rounded p-1 nexo-state-transition hover:bg-[var(--accent-soft)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
