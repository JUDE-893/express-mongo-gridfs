export function toCapCase(str: string) {
  return str.replace(/\w\S*/g, function(text) {
    return text.charAt(0).toUpperCase() + text.substring(1).toLowerCase();
  });
}

export default { toCapCase };