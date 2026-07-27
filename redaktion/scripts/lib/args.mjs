export function argument(name, { required = false } = {}) {
  const args = process.argv.slice(2);
  const inline = args.find((item) => item.startsWith(`${name}=`));
  const value = inline
    ? inline.slice(name.length + 1)
    : args.includes(name)
      ? args[args.indexOf(name) + 1]
      : undefined;

  if (required && !value) throw new Error(`Argument fehlt: ${name}`);
  return value;
}
