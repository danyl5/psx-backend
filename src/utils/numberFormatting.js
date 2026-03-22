
const formatNumber = (value) => {

  const num = Number(String(value).replace(/,/g, "")); // remove commas
  const format = (n, symbol) =>
    parseFloat((num / n).toFixed(2)) + symbol;

  if (num >= 1e9) return format(1e9, "B");
  if (num >= 1e6) return format(1e6, "M");
  if (num >= 1e3) return format(1e3, "K");
  return num;
}

export default formatNumber;