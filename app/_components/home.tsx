"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, storage } from "@/lib/client/api";
import { DEFAULT_SETTINGS } from "@/lib/room";
import { LangSwitch } from "./bits";
import { errorText, useLang } from "./lang";

export function Home() {
  const { t } = useLang();
  const router = useRouter();
  const [name, setName] = useState("");
  const [s, setS] = useState({ ...DEFAULT_SETTINGS });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(storage.getName()), []);

  const num = (k: keyof typeof s) => ({
    value: s[k],
    inputMode: "numeric" as const,
    type: "number",
    className: "input num",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) }),
  });

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createRoom(name.trim(), s);
      storage.setToken(res.code, res.token);
      storage.setName(name.trim());
      // Save a tap: the host sits in the first seat right away.
      await api.command(res.code, res.token, { cmd: "sit", seat: 0 }).catch(() => {});
      router.push(`/r/${res.code}`);
    } catch (err) {
      setError(errorText(t, err instanceof ApiError ? err.code : undefined));
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ♠
          </span>
          {t("appName")}
        </div>
        <LangSwitch />
      </div>

      <section className="hero">
        <h1>{t("tagline")}</h1>
        <p className="muted">{t("howItWorks")}</p>
      </section>

      <form className="panel" onSubmit={create}>
        <div className="field">
          <label htmlFor="name">{t("yourName")}</label>
          <input
            id="name"
            className="input"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <details>
          <summary>{t("tableSettings")}</summary>
          <div className="settings-grid" style={{ marginTop: 10 }}>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>{t("startingChips")}</label>
              <input {...num("startingStack")} min={100} step={100} />
            </div>
            <div className="field">
              <label>{t("smallBlind")}</label>
              <input {...num("smallBlind")} min={1} />
            </div>
            <div className="field">
              <label>{t("bigBlind")}</label>
              <input {...num("bigBlind")} min={2} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>{t("turnSeconds")}</label>
              <input {...num("turnSeconds")} min={10} max={120} step={5} />
            </div>
          </div>
        </details>

        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={!name.trim() || busy}>
          {busy ? t("creating") : t("createRoom")}
        </button>
      </form>

      <p className="legal">
        {t("legal18")} · <a href="/terms" style={{ color: "inherit" }}>{t("terms")}</a>
      </p>
    </main>
  );
}
