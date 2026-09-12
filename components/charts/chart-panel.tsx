"use client";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Dialog, EmptyState } from "../ui";
import { formatNumber } from "@/lib/format";

export type ChartPoint = Record<string, string | number | null>;
export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}
interface ChartProps {
  title: string;
  subtitle?: string;
  data: ChartPoint[];
  series: ChartSeries[];
  kind?: "line" | "area" | "bar" | "scatter";
  xKey?: string;
  xLabel?: string;
  unit?: string;
  domain?: [number, number];
  reversed?: boolean;
  className?: string;
  detail?: boolean;
}
const axisStyle = { fontSize: 10, fill: "#89958c" };
export function ChartPanel({
  title,
  subtitle,
  data,
  series,
  kind = "line",
  xKey = "name",
  xLabel,
  unit = "",
  domain,
  reversed,
  className,
  detail = false,
}: ChartProps) {
  const [expanded, setExpanded] = useState(false);
  const axes = (
    <>
      <CartesianGrid stroke="#2b3330" strokeDasharray="3 5" vertical={false} />
      <XAxis
        dataKey={xKey}
        type={kind === "scatter" ? "number" : "category"}
        domain={kind === "scatter" ? [0, "auto"] : undefined}
        tick={axisStyle}
        axisLine={false}
        tickLine={false}
        minTickGap={28}
        tickMargin={10}
        name={xLabel}
        unit={
          kind === "scatter" && xLabel === "Čas učenia"
            ? " min"
            : kind === "scatter"
              ? " %"
              : undefined
        }
        tickFormatter={(value) =>
          String(value).length > 15
            ? `${String(value).slice(0, 13)}…`
            : String(value)
        }
      />
      <YAxis
        tick={axisStyle}
        axisLine={false}
        tickLine={false}
        width={42}
        domain={domain}
        reversed={reversed}
        unit={unit}
        dataKey={kind === "scatter" ? series[0].key : undefined}
        type="number"
        allowDecimals={
          !series.every((item) =>
            ["mistakes", "minutes", "recommended"].includes(item.key),
          )
        }
        name={series[0]?.label}
      />
      <Tooltip
        cursor={{ stroke: "#738665", strokeDasharray: "4 4" }}
        content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const point = payload[0].payload as ChartPoint;
          return (
            <div className="chart-tooltip">
              <strong>{String(point.name ?? label ?? "")}</strong>
              {kind === "scatter" && (
                <div className="chart-tooltip-line">
                  <span>{xLabel}</span>
                  <b>
                    {formatNumber(Number(point[xKey]))}
                    {xLabel === "Čas učenia" ? " min" : " %"}
                  </b>
                </div>
              )}
              {series.map((item) => (
                <div className="chart-tooltip-line" key={item.key}>
                  <span>{item.label}</span>
                  <b>
                    {formatNumber(Number(point[item.key]), 2)}
                    {unit}
                  </b>
                </div>
              ))}
            </div>
          );
        }}
      />
      <Legend
        iconType="circle"
        iconSize={6}
        wrapperStyle={{ paddingTop: 15, fontSize: 10 }}
      />
    </>
  );
  const margin = { top: 8, right: 10, bottom: 5, left: -8 };
  return <>
    <Card
      title={title}
      subtitle={subtitle}
      className={`chart-card ${className ?? ""}`}
    >
      {!data.length ? (
        <EmptyState
          compact
          title="Zatiaľ nie je čo zobraziť"
          description="Graf sa doplní po uložení príslušných záznamov."
        />
      ) : (
        <div
          className={`chart-shell ${!detail ? "chart-clickable" : ""}`}
          role={detail ? "img" : "button"}
          tabIndex={detail ? undefined : 0}
          aria-label={`${title}: ${data.length} dátových bodov`}
          onClick={() => { if (!detail) setExpanded(true); }}
          onKeyDown={(event) => { if (!detail && (event.key === "Enter" || event.key === " ")) setExpanded(true); }}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 500, height: 245 }}
          >
            {kind === "scatter" ? (
              <ScatterChart margin={margin}>
                {axes}
                <Scatter
                  name={series[0].label}
                  data={data}
                  fill={series[0].color}
                  isAnimationActive={false}
                >
                  {data.map((point, index) => (
                    <Cell
                      key={index}
                      fill={String(point.color || series[0].color)}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            ) : kind === "bar" ? (
              <BarChart data={data} margin={margin}>
                {axes}
                {series.map((item) => (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    fill={item.color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  >
                    {series.length === 1 &&
                      data.map((point, index) => (
                        <Cell
                          key={index}
                          fill={String(point.color || item.color)}
                        />
                      ))}
                  </Bar>
                ))}
              </BarChart>
            ) : kind === "area" ? (
              <AreaChart data={data} margin={margin}>
                {axes}
                {series.map((item) => (
                  <Area
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    stroke={item.color}
                    fill={item.color}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    type="monotone"
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            ) : (
              <LineChart data={data} margin={margin}>
                {axes}
                {series.map((item) => (
                  <Line
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    stroke={item.color}
                    strokeWidth={2}
                    type="linear"
                    dot={{ r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
    {expanded && !detail && <Dialog title={title} onClose={() => setExpanded(false)}>
      <ChartPanel title={title} subtitle={subtitle} data={data} series={series} kind={kind} xKey={xKey} xLabel={xLabel} unit={unit} domain={domain} reversed={reversed} className="chart-detail" detail />
      <div className="chart-values"><table><thead><tr><th>{xLabel || "Bod"}</th>{series.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{data.map((point, index) => <tr key={index}><td>{String(point.name ?? point[xKey] ?? "")}</td>{series.map((item) => <td key={item.key}>{point[item.key] === null ? "—" : `${formatNumber(Number(point[item.key]), 2)}${unit}`}</td>)}</tr>)}</tbody></table></div>
    </Dialog>}
  </>;
}
