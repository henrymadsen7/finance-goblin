import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
export function isPublicAddress(ip) {
  if (isIP(ip) === 6)
    return (
      /^2[0-9a-f]{3}:/i.test(ip) && !ip.toLowerCase().startsWith("2001:db8:")
    );
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return !(
    [0, 10, 127].includes(a) ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function publicText(
  input,
  { maxBytes = 3_000_000, redirects = 0 } = {},
) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["", "443"].includes(url.port)
  )
    throw Error("Use a public HTTPS source URL.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw Error("Private network sources are not supported.");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: { Accept: "text/calendar, application/json, text/plain" },
        lookup: (_host, _opts, cb) => cb(null, address.address, address.family),
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (redirects >= 3)
            return reject(Error("Too many source redirects."));
          return publicText(new URL(res.headers.location, url), {
            maxBytes,
            redirects: redirects + 1,
          }).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            Error("The source could not be read. Check access and try again."),
          );
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(Error("Source exceeds the import limit."));
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", () => reject(Error("Source connection failed.")));
      },
    );
    req.setTimeout(20000, () =>
      req.destroy(Error("Source connection timed out.")),
    );
    req.on("error", () =>
      reject(Error("Source connection failed. Check the URL and try again.")),
    );
    req.end();
  });
}
