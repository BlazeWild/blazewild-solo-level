import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";
import { categories } from "../domain/model";
export function HabitRadar({ scores }: { scores: Record<string, number> }) {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Six habit scores, game points"
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          data={categories.map((c) => ({ category: c, points: scores[c] }))}
        >
          <PolarGrid stroke="#40506a" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: "#a5b1c4", fontSize: 11 }}
          />
          <Radar
            dataKey="points"
            stroke="#b7ed83"
            fill="#b7ed83"
            fillOpacity={0.22}
          />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Chart({
  title,
  field,
  unit,
  data,
  secondary,
}: {
  title: string;
  field: string;
  unit: string;
  data: any[];
  secondary?: string;
}) {
  const isBar = field === "steps",
    C = isBar ? BarChart : LineChart;
  return (
    <section className="card chart-card">
      <h3>{title}</h3>
      <small className="muted">
        {unit}
        {field === "weight"
          ? " · average over 7 calendar days; sample counts below"
          : ""}
      </small>
      {data.every((d) => d[field] === null) && (
        <p className="no-data">No measurements yet</p>
      )}
      <div className="chart" role="img" aria-label={title + " in " + unit}>
        <ResponsiveContainer width="100%" height="100%">
          <C data={data}>
            <CartesianGrid
              stroke="#2b3545"
              strokeDasharray="3 5"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => v.slice(5)}
              tick={{ fill: "#a5b1c4", fontSize: 10 }}
              minTickGap={25}
            />
            <YAxis tick={{ fill: "#a5b1c4", fontSize: 11 }} width={42} />
            <Tooltip
              contentStyle={{
                background: "#151d29",
                border: "1px solid #40506a",
                borderRadius: 9,
              }}
            />
            {isBar ? (
              <Bar dataKey={field} fill="#b7ed83" radius={[3, 3, 0, 0]} />
            ) : (
              <Line
                dataKey={field}
                name={unit}
                type="monotone"
                stroke="#b7ed83"
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            )}{" "}
            {secondary === "target" ? (
              <ReferenceLine
                y={data[0]?.target ?? 0}
                stroke="#88b9ff"
                strokeDasharray="4 4"
                label="Target"
              />
            ) : (
              secondary && (
                <Line
                  dataKey={secondary}
                  stroke="#88b9ff"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )
            )}
          </C>
        </ResponsiveContainer>
      </div>
      <details>
        <summary>View data table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>{unit}</th>
                {secondary && <th>{secondary}</th>}
                {field === "weight" && <th>Samples</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d[field] ?? "—"}</td>
                  {secondary && (
                    <td>
                      {d[secondary] === null
                        ? "—"
                        : typeof d[secondary] === "number"
                          ? Math.round(d[secondary] * 10) / 10
                          : d[secondary]}
                    </td>
                  )}
                  {field === "weight" && <td>{d.samples}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
