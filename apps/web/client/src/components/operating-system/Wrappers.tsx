import type { ReactNode } from "react";
import { DataTable, type DataTableProps } from "@/components/DataTable";
import { ActionBarWrapper } from "./ActionBar";
import { OperationalHeader } from "./OperationalHeader";

type PageWrapperProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  primaryAction?: ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
  showOperationalHeader?: boolean;
  children: ReactNode;
};

export function PageWrapper({
  title: _title,
  subtitle,
  primaryAction,
  breadcrumb,
  showOperationalHeader = true,
  children,
}: PageWrapperProps) {
  return (
    <div className="nexo-page-shell nexo-section-reveal min-w-0 max-w-full space-y-4">
      <div className="space-y-4 md:space-y-5">
        {showOperationalHeader ? (
          <OperationalHeader
            description={subtitle}
            primaryAction={primaryAction}
            breadcrumb={breadcrumb}
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function DataTableWrapper<T extends { id?: number | string }>(props: DataTableProps<T>) {
  return <DataTable {...props} />;
}

export { ActionBarWrapper };
