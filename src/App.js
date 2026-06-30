import { useState, useEffect } from "react";
import "./styles.css";
import { supabase } from "./supabaseClient";
import GastosModule from "./GastosModule.jsx";
import IngresosModule from "./IngresosModule.jsx";
import VencimientosModule from "./VencimientosModule.jsx";
import ResumenModule from "./ResumenModule.jsx";

export default function App() {
  const [pestanaActiva, setPestanaActiva] = useState("resumen");
  const [alertas, setAlertas] = useState([]);
  const [mostrarAlertas, setMostrarAlertas] = useState(false);

  useEffect(() => {
    solicitarPermisoNotificaciones();
    verificarVencimientos();
  }, []);

  async function solicitarPermisoNotificaciones() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  async function verificarVencimientos() {
    const { data, error } = await supabase
      .from("gastos")
      .select("*, categoria:categoria_id(nombre)")
      .eq("estado", "pendiente")
      .order("fecha_vencimiento", { ascending: true });

    if (error || !data) return;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const gruposVistos = new Set();
    const gastosFiltrados = data.filter((g) => {
      if (!g.es_cuota || !g.grupo_cuota_id) return true;
      if (gruposVistos.has(g.grupo_cuota_id)) return false;
      gruposVistos.add(g.grupo_cuota_id);
      return true;
    });

    const alertasEncontradas = [];

    gastosFiltrados.forEach((g) => {
      const vence = new Date(g.fecha_vencimiento + "T00:00:00");
      const dias = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));

      if (dias <= 2) {
        const nombre = g.es_cuota
          ? `${g.descripcion.split(" (")[0]} (cuota ${g.numero_cuota}/${
              g.total_cuotas
            })`
          : g.descripcion;

        let mensaje = "";
        let urgencia = "";
        if (dias < 0) {
          mensaje = `Venció hace ${Math.abs(dias)} día${
            Math.abs(dias) !== 1 ? "s" : ""
          }`;
          urgencia = "vencido";
        } else if (dias === 0) {
          mensaje = "Vence hoy";
          urgencia = "hoy";
        } else {
          mensaje = `Vence en ${dias} día${dias !== 1 ? "s" : ""}`;
          urgencia = "proximo";
        }

        alertasEncontradas.push({
          id: g.id,
          nombre,
          mensaje,
          urgencia,
          monto: g.monto,
          categoria: g.categoria?.nombre,
        });

        if (Notification.permission === "granted") {
          new Notification(`💸 ${nombre}`, {
            body: `${mensaje} · $${parseFloat(g.monto).toLocaleString(
              "es-AR"
            )}`,
            icon: "/favicon.ico",
            tag: g.id,
          });
        }
      }
    });

    if (alertasEncontradas.length > 0) {
      setAlertas(alertasEncontradas);
      setMostrarAlertas(true);
    }
  }

  return (
    <div>
      <nav className="nav">
        <button
          className={`nav-btn ${
            pestanaActiva === "resumen" ? "nav-btn-activo" : ""
          }`}
          onClick={() => setPestanaActiva("resumen")}
        >
          Resumen
        </button>
        <button
          className={`nav-btn ${
            pestanaActiva === "gastos" ? "nav-btn-activo" : ""
          }`}
          onClick={() => setPestanaActiva("gastos")}
        >
          Gastos
        </button>
        <button
          className={`nav-btn ${
            pestanaActiva === "ingresos" ? "nav-btn-activo" : ""
          }`}
          onClick={() => setPestanaActiva("ingresos")}
        >
          Ingresos
        </button>
        <button
          className={`nav-btn ${
            pestanaActiva === "vencimientos" ? "nav-btn-activo" : ""
          }`}
          onClick={() => {
            setPestanaActiva("vencimientos");
            setMostrarAlertas(false);
          }}
        >
          Vencimientos
          {alertas.length > 0 && (
            <span className="nav-badge">{alertas.length}</span>
          )}
        </button>
      </nav>

      {/* BANNER DE ALERTAS */}
      {mostrarAlertas && alertas.length > 0 && (
        <div className="alertas-banner">
          <div className="alertas-header">
            <span className="alertas-titulo">
              ⚠️ {alertas.length} pago{alertas.length !== 1 ? "s" : ""} requiere
              {alertas.length === 1 ? "" : "n"} atención
            </span>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button
                onClick={() => {
                  setMostrarAlertas(false);
                  setPestanaActiva("vencimientos");
                }}
                className="alertas-ver-btn"
              >
                Ver vencimientos →
              </button>
              <button
                onClick={() => setMostrarAlertas(false)}
                className="alertas-cerrar"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {pestanaActiva === "resumen" && <ResumenModule />}
      {pestanaActiva === "gastos" && <GastosModule />}
      {pestanaActiva === "ingresos" && <IngresosModule />}
      {pestanaActiva === "vencimientos" && <VencimientosModule />}
    </div>
  );
}
