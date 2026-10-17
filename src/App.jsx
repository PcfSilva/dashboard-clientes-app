import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const daysUntil = (s) => Math.round((toDate(s) - toDate(todayStr())) / 86400000);
const fmtDate = (s) => toDate(s).toLocaleDateString("pt-BR");
const MSG = {
  msg_before: "Olá {nome}! Seu plano vence em 3 dias ({data}). Valor: {valor}. Podemos renovar?",
  msg_today: "Olá {nome}! Seu plano vence hoje ({data}). Valor: {valor}. Podemos renovar?",
};

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (signUp) => {
    setBusy(true); setErr("");
    const { error } = signUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    else if (signUp) setErr("Conta criada. Se o Supabase pedir, confirme o e-mail e entre.");
    setBusy(false);
  };
  return (
    <main className="login">
      <img className="logo" src="/logo.png" alt="Artv" />
      <p className="hint">Entre para ver seus dados em qualquer aparelho.</p>
      <div className="panel">
        <div className="loginform">
          <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Senha (mínimo 6 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} onClick={() => go(false)}>Entrar</button>
          <button className="ghost" disabled={busy} onClick={() => go(true)}>Criar conta</button>
          {err && <p className="err">{err}</p>}
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  return session ? <Dashboard session={session} /> : <Login />;
}

function Dashboard({ session }) {
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [sent, setSent] = useState({});
  const [msgs, setMsgs] = useState(MSG);
  const [error, setError] = useState("");
  const [serversOpen, setServersOpen] = useState(() => localStorage.getItem("serversOpen") === "1");
  const toggleServers = () => setServersOpen((o) => { localStorage.setItem("serversOpen", o ? "0" : "1"); return !o; });
  const [form, setForm] = useState({ name: "", phone: "", server_id: "", due: todayStr(), value: "" });

  const check = (res) => { if (res.error) setError(res.error.message); else setError(""); return res; };

  const load = useCallback(async () => {
    const [s, c, l, st] = await Promise.all([
      supabase.from("servers").select("*").order("created_at"),
      supabase.from("clients").select("*").order("due"),
      supabase.from("sent_log").select("*"),
      supabase.from("settings").select("*").maybeSingle(),
    ]);
    [s, c, l, st].forEach((r) => r.error && setError(r.error.message));
    if (s.data) setServers(s.data);
    if (c.data) setClients(c.data);
    if (l.data) setSent(Object.fromEntries(l.data.map((x) => [`${x.client_id}-${x.due}-${x.days}`, true])));
    if (st.data) setMsgs({ msg_before: st.data.msg_before ?? MSG.msg_before, msg_today: st.data.msg_today ?? MSG.msg_today });
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("sync");
    ["servers", "clients", "sent_log", "settings"].forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, load)
    );
    ch.subscribe();
    window.addEventListener("focus", load);
    return () => { supabase.removeChannel(ch); window.removeEventListener("focus", load); };
  }, [load]);

  const serverById = (id) => servers.find((s) => s.id === id);

  const totals = useMemo(() => {
    const gross = clients.reduce((a, c) => a + (Number(c.value) || 0), 0);
    const cost = clients.reduce((a, c) => a + (Number(serverById(c.server_id)?.cost) || 0), 0);
    return { gross, cost, net: gross - cost };
  }, [clients, servers]);

  const sorted = useMemo(() => [...clients].sort((a, b) => a.due.localeCompare(b.due)), [clients]);
  const pending = sorted.filter((c) => [0, 3].includes(daysUntil(c.due)) && !sent[`${c.id}-${c.due}-${daysUntil(c.due)}`]).length;

  // edição: atualiza na tela na hora e grava no banco ao sair do campo (ou ao escolher)
  const editClient = (id, patch) => setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const saveClient = async (id, patch) => {
    const c = clients.find((x) => x.id === id);
    const row = { name: c.name, phone: c.phone, server_id: c.server_id, due: c.due, value: Number(c.value) || 0, ...patch };
    check(await supabase.from("clients").update(row).eq("id", id));
  };
  const editServer = (id, patch) => setServers((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const saveServer = async (id) => {
    const s = serverById(id);
    check(await supabase.from("servers").update({ name: s.name, cost: Number(s.cost) || 0 }).eq("id", id));
  };

  const addServer = async () => {
    const { data, error } = await supabase.from("servers").insert({ name: `Servidor ${servers.length + 1}`, cost: 0 }).select().single();
    if (error) return setError(error.message);
    setServers((s) => [...s, data]);
  };
  const delServer = async (id) => {
    if (clients.some((c) => c.server_id === id)) return alert("Este servidor está em uso por clientes.");
    if (!window.confirm(`Apagar o servidor "${serverById(id)?.name || ""}"?`)) return;
    check(await supabase.from("servers").delete().eq("id", id));
    setServers((s) => s.filter((x) => x.id !== id));
  };
  const addClient = async () => {
    if (!form.name.trim() || !form.due) return;
    const row = { name: form.name.trim(), phone: form.phone, server_id: form.server_id || servers[0]?.id || null, due: form.due, value: Number(form.value) || 0 };
    const { data, error } = await supabase.from("clients").insert(row).select().single();
    if (error) return setError(error.message);
    setClients((c) => [...c, data]);
    setForm({ ...form, name: "", phone: "", value: "" });
  };
  const delClient = async (id) => {
    const c = clients.find((x) => x.id === id);
    if (!window.confirm(`Apagar o cliente "${c?.name || ""}"? Essa ação não pode ser desfeita.`)) return;
    check(await supabase.from("clients").delete().eq("id", id));
    setClients((c) => c.filter((x) => x.id !== id));
  };
  const saveMsgs = async () => check(await supabase.from("settings").upsert({ user_id: session.user.id, ...msgs }));

  const sendMessage = async (c) => {
    const d = daysUntil(c.due);
    const tpl = d === 0 ? msgs.msg_today : msgs.msg_before;
    const text = tpl.replace("{nome}", c.name).replace("{data}", fmtDate(c.due)).replace("{valor}", brl(c.value));
    window.open(`https://wa.me/${(c.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
    setSent((s) => ({ ...s, [`${c.id}-${c.due}-${d}`]: true }));
    await supabase.from("sent_log").upsert({ client_id: c.id, due: c.due, days: d }, { onConflict: "client_id,due,days" });
  };

  const status = (d) => {
    if (d < 0) return { t: `Vencido há ${-d}d`, k: "late" };
    if (d === 0) return { t: "Vence hoje", k: "today" };
    if (d === 3) return { t: "Vence em 3 dias", k: "soon" };
    return { t: `Em ${d} dias`, k: "ok" };
  };

  return (
    <main>
      <header className="top">
        <div className="topbar">
          <img className="logo" src="/logo.png" alt="Artv" />
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
        <h1 className="title">Vencimentos</h1>
        <p>{pending > 0 ? `${pending} aviso${pending > 1 ? "s" : ""} para enviar hoje` : "Nenhum aviso pendente hoje"}</p>
        {error && <p className="err">{error}</p>}
      </header>

      <section className="totals">
        <div className="tot"><span>Valor bruto</span><strong>{brl(totals.gross)}</strong></div>
        <div className="tot"><span>Custo dos servidores</span><strong>− {brl(totals.cost)}</strong></div>
        <div className="tot net"><span>Valor líquido</span><strong>{brl(totals.net)}</strong></div>
      </section>

      <section className="panel">
        <button className="fold" onClick={toggleServers} aria-expanded={serversOpen}>
          <h2>Servidores <small>({servers.length})</small></h2>
          <span className={`chev ${serversOpen ? "open" : ""}`} aria-hidden="true">▾</span>
        </button>
        {serversOpen && <div className="servers">
          {servers.map((s) => (
            <div className="server" key={s.id}>
              <input value={s.name} onChange={(e) => editServer(s.id, { name: e.target.value })} onBlur={() => saveServer(s.id)} aria-label="Nome do servidor" />
              <label>R$
                <input type="number" min="0" step="0.01" value={s.cost} onChange={(e) => editServer(s.id, { cost: e.target.value })} onBlur={() => saveServer(s.id)} aria-label="Valor do servidor" />
              </label>
              <small>{clients.filter((c) => c.server_id === s.id).length} cliente(s)</small>
              <button className="ghost" onClick={() => delServer(s.id)}>Remover</button>
            </div>
          ))}
          <button className="ghost add" onClick={addServer}>+ Novo servidor</button>
        </div>}
      </section>

      <section className="panel">
        <h2>Novo cliente</h2>
        <div className="form">
          <input placeholder="Nome do cliente" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="WhatsApp (DDD + número)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select value={form.server_id} onChange={(e) => setForm({ ...form, server_id: e.target.value })}>
            <option value="">Servidor</option>
            {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          <input type="number" min="0" step="0.01" placeholder="Valor (R$)" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <button onClick={addClient}>Adicionar cliente</button>
        </div>
      </section>

      <section className="panel">
        <h2>Clientes</h2>
        {sorted.length === 0 ? (
          <p className="empty">Nenhum cliente ainda. Adicione o primeiro acima.</p>
        ) : (
          <div className="table">
            <div className="row head">
              <span>Vencimento</span><span>Cliente</span><span>Servidor</span><span>Valor</span><span>Status</span><span></span>
            </div>
            {sorted.map((c) => {
              const d = daysUntil(c.due);
              const st = status(d);
              const canSend = d === 3 || d === 0;
              const done = sent[`${c.id}-${c.due}-${d}`];
              return (
                <div className="row" key={c.id}>
                  <span data-l="Vencimento"><input type="date" value={c.due} onChange={(e) => { editClient(c.id, { due: e.target.value }); if (e.target.value) saveClient(c.id, { due: e.target.value }); }} /></span>
                  <span data-l="Cliente"><input value={c.name} onChange={(e) => editClient(c.id, { name: e.target.value })} onBlur={() => saveClient(c.id)} /></span>
                  <span data-l="Servidor">
                    <select value={c.server_id || ""} onChange={(e) => { editClient(c.id, { server_id: e.target.value }); saveClient(c.id, { server_id: e.target.value }); }}>
                      {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </span>
                  <span data-l="Valor"><input type="number" min="0" step="0.01" value={c.value} onChange={(e) => editClient(c.id, { value: e.target.value })} onBlur={() => saveClient(c.id)} /></span>
                  <span data-l="Status"><b className={`badge ${st.k}`}>{st.t}</b></span>
                  <span className="acts">
                    <button disabled={!canSend} onClick={() => sendMessage(c)} title={canSend ? "Abrir WhatsApp com a mensagem" : "Disponível 3 dias antes e no dia do vencimento"}>
                      {done ? "Enviar de novo" : "Enviar mensagem"}
                    </button>
                    <button className="ghost" onClick={() => delClient(c.id)} aria-label="Remover cliente">×</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Mensagens</h2>
        <p className="hint">Use {"{nome}"}, {"{data}"} e {"{valor}"} no texto.</p>
        <label className="msg">3 dias antes<textarea rows="2" value={msgs.msg_before} onChange={(e) => setMsgs({ ...msgs, msg_before: e.target.value })} onBlur={saveMsgs} /></label>
        <label className="msg">No dia do vencimento<textarea rows="2" value={msgs.msg_today} onChange={(e) => setMsgs({ ...msgs, msg_today: e.target.value })} onBlur={saveMsgs} /></label>
      </section>
    </main>
  );
}
