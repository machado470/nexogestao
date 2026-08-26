import { Button } from "@/components/ui/button";
import { useEffect, useState } from 'react';

import { ChevronRight, X } from 'lucide-react';

interface OnboardingTooltipProps {
  isActive: boolean;
  title: string;
  description: string;
  targetSelector: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function OnboardingTooltip({
  isActive,
  title,
  description,
  targetSelector,
  position = 'bottom',
  currentStep,
  totalSteps,
  onNext,
  onSkip,
  action,
}: OnboardingTooltipProps) {
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const element = document.querySelector(targetSelector);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let top = rect.top + scrollY;
    let left = rect.left + scrollX;

    switch (position) {
      case 'bottom':
        top = rect.bottom + scrollY + 16;
        left = rect.left + scrollX + rect.width / 2 - 150; // Assuming tooltip width is 300px
        break;
      case 'top':
        top = rect.top + scrollY - 16;
        left = rect.left + scrollX + rect.width / 2 - 150;
        break;
      case 'left':
        top = rect.top + scrollY + rect.height / 2 - 50;
        left = rect.left + scrollX - 16;
        break;
      case 'right':
        top = rect.top + scrollY + rect.height / 2 - 50;
        left = rect.right + scrollX + 16;
        break;
    }

    setTooltipPosition({ top, left });

    // Highlight target element
    element.classList.add('ring-2', 'ring-orange-500', 'ring-offset-2');

    return () => {
      element.classList.remove('ring-2', 'ring-orange-500', 'ring-offset-2');
    };
  }, [isActive, targetSelector, position]);

  if (!isActive || !tooltipPosition) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onSkip}
        aria-label="Click to skip onboarding"
      />

      {/* Tooltip */}
      <div
        className="fixed z-50 bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4 w-80 border border-gray-200 dark:border-gray-700"
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onSkip}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{description}</p>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Passo {currentStep + 1} de {totalSteps}
          </div>

          <div className="flex gap-2">
            {action && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  action.onClick();
                  onNext();
                }}
              >
                {action.label}
              </Button>
            )}
            <Button size="sm" onClick={onNext} className="gap-1">
              Próximo <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}
