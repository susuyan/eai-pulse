const shanghaiCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function shanghaiDateKey(date) {
  const parts = shanghaiCalendar.formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dailyTrendOrder(length, dateKey) {
  const order = Array.from({ length: Math.max(0, length) }, (_, index) => index);
  let seed = 2166136261;
  for (const character of dateKey) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  for (let index = order.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const selected = Math.floor((seed / 4294967296) * (index + 1));
    [order[index], order[selected]] = [order[selected], order[index]];
  }
  return order;
}

export function setupDailyEmbodiedTrends(root, date = new Date()) {
  const list = root?.querySelector("[data-trend-list]");
  if (!list) return;
  const trends = [...list.querySelectorAll("[data-embodied-trend]")].sort(
    (left, right) => Number(left.dataset.trendIndex) - Number(right.dataset.trendIndex),
  );
  const day = shanghaiDateKey(date);
  dailyTrendOrder(trends.length, day).forEach((index) => {
    list.append(trends[index]);
  });
  const status = root.querySelector("[data-trend-status]");
  if (status) status.textContent = `${status.dataset.dailyLabel} · ${day} · Asia/Shanghai`;
}
