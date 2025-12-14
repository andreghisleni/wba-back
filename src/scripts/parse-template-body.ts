export function parseTemplateBody(rawBody: string, variables: string[] = []): string {
  let parsed = rawBody;
  variables.forEach((val, index) => {
    const placeholder = `{{${index + 1}}}`;
    parsed = parsed.replaceAll(placeholder, val);
  });
  return parsed;
}