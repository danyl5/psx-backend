// PSX trading sessions in Pakistan time, as minutes from midnight.
// Friday trades in two sessions with a break for prayers in between.
const WEEKDAY_SESSIONS = [[9 * 60 + 30, 15 * 60 + 30]];
const FRIDAY_SESSIONS = [
  [9 * 60 + 15, 12 * 60],
  [14 * 60 + 30, 16 * 60 + 30],
];

/** "Open", "Break" (between two sessions of the same day) or "Closed". */
export function getPSXMarketState(now = new Date()) {
  const pakistanNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Karachi" }),
  );

  const day = pakistanNow.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const currentMinutes = pakistanNow.getHours() * 60 + pakistanNow.getMinutes();

  if (day === 0 || day === 6) return "Closed";

  const sessions = day === 5 ? FRIDAY_SESSIONS : WEEKDAY_SESSIONS;

  const isOpen = sessions.some(
    ([openMinutes, closeMinutes]) =>
      currentMinutes >= openMinutes && currentMinutes < closeMinutes,
  );
  if (isOpen) return "Open";

  const dayOpen = sessions[0][0];
  const dayClose = sessions[sessions.length - 1][1];
  return currentMinutes >= dayOpen && currentMinutes < dayClose
    ? "Break"
    : "Closed";
}
