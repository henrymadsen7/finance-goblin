import { randomBytes, createHash } from "node:crypto";
export function createGoogle(domain, origin, { fetcher = fetch } = {}) {
  const pending = new Map();
  const settings = () => domain.store.get("settings", "google") || {};
  const redirect = `${origin}/oauth/life/google`;
  const safeFetch = async (url, init = {}) => {
    const response = await fetcher(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      throw Error(
        "Google could not complete this request. Reconnect your account or try again.",
      );
    return response.json();
  };
  async function token(connection) {
    if (connection.expiresAt > Date.now() + 60000) return connection.token;
    const cfg = settings();
    const data = await safeFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret || "",
        refresh_token: connection.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    connection = {
      ...connection,
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    domain.store.put("connection", connection.id, connection);
    return connection.token;
  }
  function begin(service) {
    if (!["calendar", "gmail", "drive"].includes(service))
      throw Error("Unknown Google service.");
    const cfg = settings();
    if (!cfg.clientId)
      throw Error("Add your Google desktop OAuth client in Settings first.");
    for (const [id, s] of pending)
      if (s.expires < Date.now()) pending.delete(id);
    if (pending.size >= 10) throw Error("Finish the pending sign-in first.");
    const state = randomBytes(32).toString("hex"),
      verifier = randomBytes(48).toString("base64url");
    pending.set(state, { service, verifier, expires: Date.now() + 300000 });
    return (
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: `openid email https://www.googleapis.com/auth/${service === "gmail" ? "gmail.readonly" : service === "drive" ? "drive.readonly" : "calendar.readonly"}`,
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      })
    );
  }
  async function callback(query) {
    const entry = pending.get(query.state);
    pending.delete(query.state);
    if (!entry || entry.expires < Date.now())
      throw Error("This sign-in expired. Start again from Life.");
    if (query.error || !query.code)
      throw Error("Google sign-in was not completed.");
    const cfg = settings();
    const data = await safeFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret || "",
        redirect_uri: redirect,
        code: query.code,
        code_verifier: entry.verifier,
        grant_type: "authorization_code",
      }),
    });
    const user = await safeFetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${data.access_token}` } },
    );
    const id = `google:${entry.service}:${user.sub}`;
    const previous = domain.store.get("connection", id);
    domain.store.put("connection", id, {
      id,
      service: entry.service,
      provider: "google",
      label: user.email,
      token: data.access_token,
      refreshToken: data.refresh_token || previous?.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      status: "connected",
      lastSync: null,
    });
    return id;
  }
  async function sync(id) {
    let connection = domain.store.get("connection", id);
    if (!connection || connection.provider !== "google")
      throw Error("Google account not found.");
    try {
      const access = await token(connection),
        headers = { Authorization: `Bearer ${access}` },
        now = new Date().toISOString();
      const get = (path) =>
        safeFetch(`https://www.googleapis.com/${path}`, { headers });
      if (connection.service === "calendar") {
        const calendars = [];
        let pageToken;
        do {
          const r = await get(
            "calendar/v3/users/me/calendarList?" +
              new URLSearchParams({
                maxResults: "250",
                ...(pageToken ? { pageToken } : {}),
              }),
          );
          calendars.push(...(r.items || []));
          pageToken = r.nextPageToken;
        } while (pageToken && calendars.length < 1000);
        if (pageToken) throw Error("Too many calendars to import safely.");
        const events = [];
        for (const cal of calendars.filter(
          (c) => !c.deleted && c.selected !== false,
        )) {
          let nextPage;
          do {
            const r = await get(
              `calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` +
                new URLSearchParams({
                  singleEvents: "true",
                  maxResults: "2500",
                  timeMin: new Date(Date.now() - 90 * 86400000).toISOString(),
                  timeMax: new Date(Date.now() + 370 * 86400000).toISOString(),
                  ...(nextPage ? { pageToken: nextPage } : {}),
                }),
            );
            for (const e of r.items || [])
              if (e.status !== "cancelled" && e.start)
                events.push({
                  id: `${id}:${cal.id}:${e.id}`,
                  title: e.summary || "Untitled event",
                  start: e.start.dateTime || e.start.date,
                  end: e.end?.dateTime || e.end?.date || null,
                  allDay: !!e.start.date,
                  courseId: null,
                  projectId: null,
                  location: e.location || "",
                  description: e.description || "",
                  connectionId: id,
                  source: {
                    kind: "google",
                    label: `${connection.label} · ${cal.summary}`,
                    url: e.htmlLink,
                    externalId: e.id,
                    observedAt: now,
                    timeZone: e.start.timeZone || cal.timeZone,
                  },
                });
            nextPage = r.nextPageToken;
            if (events.length > 20000)
              throw Error("Google calendar exceeds the import limit.");
          } while (nextPage);
        }
        domain.store.batch(() => {
          for (const e of domain.store.list("event"))
            if (e.connectionId === id) domain.store.remove("event", e.id);
          for (const e of events) domain.store.put("event", e.id, e);
        });
      } else if (connection.service === "drive") {
        const result = await get(
          "drive/v3/files?" +
            new URLSearchParams({
              q: "trashed = false",
              pageSize: "100",
              orderBy: "modifiedTime desc",
              fields:
                "files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken",
              spaces: "drive",
            }),
        );
        const files = (result.files || []).map((f) => ({
          id: `${id}:${f.id}`,
          externalId: f.id,
          connectionId: id,
          name: f.name || "Untitled file",
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime || null,
          url: `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`,
          source: {
            kind: "google",
            label: `${connection.label} · Google Drive`,
            externalId: f.id,
            observedAt: now,
          },
        }));
        domain.store.batch(() => {
          for (const f of domain.store.list("driveFile"))
            if (f.connectionId === id) domain.store.remove("driveFile", f.id);
          for (const f of files) domain.store.put("driveFile", f.id, f);
        });
        connection = {
          ...domain.store.get("connection", id),
          hasMore: !!result.nextPageToken,
        };
        domain.store.put("connection", id, connection);
      } else if (connection.service === "gmail") {
        const result = await get(
            "gmail/v1/users/me/messages?maxResults=50&labelIds=INBOX",
          ),
          messages = [];
        for (const item of result.messages || []) {
          const m = await get(
              `gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            ),
            h = Object.fromEntries(
              (m.payload?.headers || []).map((h) => [
                h.name.toLowerCase(),
                h.value,
              ]),
            );
          messages.push({
            id: `${id}:${m.id}`,
            connectionId: id,
            subject: h.subject || "(No subject)",
            from: h.from || "",
            date: h.date || "",
            snippet: m.snippet || "",
            url: `https://mail.google.com/mail/u/${encodeURIComponent(connection.label)}/#inbox/${m.threadId}`,
            source: {
              kind: "google",
              label: connection.label,
              externalId: m.id,
              observedAt: now,
            },
          });
        }
        domain.store.batch(() => {
          for (const m of domain.store.list("message"))
            if (m.connectionId === id) domain.store.remove("message", m.id);
          for (const m of messages) domain.store.put("message", m.id, m);
        });
      }
      connection = {
        ...domain.store.get("connection", id),
        lastSync: now,
        status: "connected",
        error: null,
      };
      domain.store.put("connection", id, connection);
      return { ok: true };
    } catch {
      domain.store.put("connection", id, {
        ...domain.store.get("connection", id),
        status: "error",
        error:
          "Could not refresh Google data. Last complete snapshot retained.",
      });
      throw Error(
        "Could not refresh Google data. Last complete snapshot retained.",
      );
    }
  }
  async function readDoc(fileId) {
    const file =
      domain.store.get("driveFile", fileId) ||
      domain.list("driveFile").find((f) => f.externalId === fileId);
    if (!file || file.mimeType !== "application/vnd.google-apps.document")
      throw Error("Choose a Google Doc from your synced Drive files.");
    const connection = domain.store.get("connection", file.connectionId);
    if (!connection || connection.service !== "drive")
      throw Error("Reconnect Google Drive first.");
    return readDocRow(file, connection);
  }
  async function readDocRow(file, connection) {
    const data = await safeFetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(file.externalId)}?includeTabsContent=true`,
      { headers: { Authorization: `Bearer ${await token(connection)}` } },
    );
    const pieces = [];
    let length = 0;
    const visit = (value) => {
      if (!value || typeof value !== "object" || length >= 200000) return;
      if (value.textRun?.content) {
        const text = String(value.textRun.content).slice(0, 200000 - length);
        pieces.push(text);
        length += text.length;
        return;
      }
      for (const child of Object.values(value))
        if (typeof child === "object") visit(child);
    };
    visit(data.tabs?.length ? data.tabs : data.body);
    return {
      title: data.title || file.name,
      text: pieces.join(""),
      truncated: length >= 200000,
      source: { ...file.source, observedAt: new Date().toISOString() },
      url: file.url,
    };
  }
  async function assistantRead(read) {
    if (read.type === "read_doc") {
      const doc = await readDoc(read.fileId);
      return {
        document: {
          ...doc,
          text: doc.text.slice(0, 16000),
          truncated: doc.truncated || doc.text.length > 16000,
        },
      };
    }
    const service =
      read.type === "gmail_search"
        ? "gmail"
        : read.type === "drive_search"
          ? "drive"
          : read.type === "calendar_search"
            ? "calendar"
            : null;
    if (!service) throw Error("Unknown read operation.");
    const accounts = domain
      .list("connection")
      .filter((c) => c.provider === "google" && c.service === service)
      .slice(0, 3);
    if (!accounts.length) throw Error("Google service is not connected.");
    const results = [];
    for (const account of accounts) {
      const headers = { Authorization: `Bearer ${await token(account)}` },
        now = new Date().toISOString();
      const get = (path) =>
        safeFetch(`https://www.googleapis.com/${path}`, { headers });
      if (service === "gmail") {
        const r = await get(
          "gmail/v1/users/me/messages?" +
            new URLSearchParams({ q: read.query, maxResults: "5" }),
        );
        for (const item of r.messages || []) {
          const m = await get(
            `gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
          );
          const h = Object.fromEntries(
            (m.payload?.headers || []).map((h) => [
              h.name.toLowerCase(),
              h.value,
            ]),
          );
          const text = [];
          const visit = (p) => {
            if (p?.mimeType === "text/plain" && p.body?.data)
              text.push(Buffer.from(p.body.data, "base64url").toString("utf8"));
            for (const part of p?.parts || []) visit(part);
          };
          visit(m.payload);
          results.push({
            subject: h.subject,
            from: h.from,
            date: h.date,
            text: text.join("\n").slice(0, 16000),
            snippet: m.snippet,
            url: `https://mail.google.com/mail/u/${encodeURIComponent(account.label)}/#inbox/${m.threadId}`,
            account: account.label,
            observedAt: now,
          });
        }
      } else if (service === "drive") {
        const words = read.query
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 6);
        const escape = (v) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const q =
          "trashed = false" +
          words.map((w) => ` and name contains '${escape(w)}'`).join("");
        const r = await get(
          "drive/v3/files?" +
            new URLSearchParams({
              q,
              pageSize: "10",
              orderBy: "modifiedTime desc",
              fields: "files(id,name,mimeType,modifiedTime)",
            }),
        );
        const files = [];
        let readCount = 0;
        for (const f of r.files || []) {
          const row = {
            id: `${account.id}:${f.id}`,
            externalId: f.id,
            connectionId: account.id,
            name: f.name,
            mimeType: f.mimeType,
            modifiedTime: f.modifiedTime,
            url: `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`,
            source: {
              kind: "google",
              label: `${account.label} · Google Drive`,
              observedAt: now,
              externalId: f.id,
            },
          };
          // Search results stay in this turn. OAuth credentials remain in the server.
          files.push(row);
          if (
            f.mimeType === "application/vnd.google-apps.document" &&
            readCount++ < 2
          ) {
            const doc = await readDocRow(row, account);
            files[files.length - 1] = {
              ...row,
              document: {
                ...doc,
                text: doc.text.slice(0, 16000),
                truncated: doc.truncated || doc.text.length > 16000,
              },
            };
          }
        }
        results.push({ account: account.label, files, observedAt: now });
      } else {
        const cals = await get(
          "calendar/v3/users/me/calendarList?maxResults=100",
        );
        for (const cal of (cals.items || [])
          .filter((c) => !c.deleted && c.selected !== false)
          .slice(0, 10)) {
          const r = await get(
            `calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` +
              new URLSearchParams({
                q: read.query,
                singleEvents: "true",
                orderBy: "startTime",
                timeMin: new Date().toISOString(),
                timeMax: new Date(Date.now() + 90 * 86400000).toISOString(),
                maxResults: "20",
              }),
          );
          results.push({
            account: account.label,
            calendar: cal.summary,
            events: (r.items || [])
              .filter((e) => e.status !== "cancelled")
              .map((e) => ({
                title: e.summary,
                start: e.start,
                end: e.end,
                location: e.location,
                url: e.htmlLink,
              })),
            observedAt: now,
          });
        }
      }
    }
    return { results };
  }
  return { begin, callback, sync, redirect, readDoc, assistantRead };
}
