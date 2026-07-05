import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

export default function VencimientosModule() {
  const [vista, setVista] = useState("lista");
  const [grupoCuotaActivo, setGrupoCuotaActivo] = useState(null);
  const [vencimientos, setVencimientos] = useState([]);
  const [detalleCuotas, setDetalleCuotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [expandirFuturos, setExpandirFuturos] = useState(false);

  // BUSCADOR
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [busquedaActiva, setBusquedaActiva] = useState("");
  const [resultadoActual, setResultadoActual] = useState(0);
  const resultadosRef = useRef([]);

  useEffect(() => {
    cargarVencimientos();
  }, []);

  useEffect(() => {
    const canal = supabase
      .channel("vencimientos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gastos" },
        () => {
          cargarVencimientos();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function cargarVencimientos() {
    setCargando(true);
    const { data, error } = await supabase
      .from("gastos")
      .select("*, categoria:categoria_id(nombre)")
      .eq("estado", "pendiente")
      .order("fecha_vencimiento", { ascending: true });
    if (error) {
      console.error("Error:", error);
      setCargando(false);
      return;
    }

    const gruposVistos = new Set();
    const filtrados = data.filter((g) => {
      if (!g.es_cuota || !g.grupo_cuota_id) return true;
      if (gruposVistos.has(g.grupo_cuota_id)) return false;
      gruposVistos.add(g.grupo_cuota_id);
      return true;
    });

    setVencimientos(filtrados);
    setCargando(false);
  }

  async function abrirDetalle(gasto) {
    if (!gasto.es_cuota || !gasto.grupo_cuota_id) return;
    const { data, error } = await supabase
      .from("gastos")
      .select("*, categoria:categoria_id(nombre)")
      .eq("grupo_cuota_id", gasto.grupo_cuota_id)
      .order("numero_cuota", { ascending: true });
    if (error) {
      console.error("Error:", error);
      return;
    }
    setDetalleCuotas(data);
    setGrupoCuotaActivo(gasto);
    setVista("detalle");
  }

  function volverALista() {
    setVista("lista");
    setGrupoCuotaActivo(null);
    setDetalleCuotas([]);
    cargarVencimientos();
  }

  async function marcarComoPagado(id) {
    const hoy = new Date().toISOString().split("T")[0];
    const { error } = await supabase
      .from("gastos")
      .update({ estado: "pagado", fecha_pago_real: hoy })
      .eq("id", id);
    if (error) {
      alert("No se pudo actualizar.");
      return;
    }

    if (vista === "detalle") {
      const { data } = await supabase
        .from("gastos")
        .select("*, categoria:categoria_id(nombre)")
        .eq("grupo_cuota_id", grupoCuotaActivo.grupo_cuota_id)
        .order("numero_cuota", { ascending: true });
      setDetalleCuotas(data);
    } else {
      cargarVencimientos();
    }
  }

  function diasHastaVencimiento(fechaVencimiento) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vence = new Date(fechaVencimiento + "T00:00:00");
    return Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
  }

  function obtenerAlerta(dias) {
    if (dias < 0)
      return {
        clase: "alerta-vencido",
        texto: `Venció hace ${Math.abs(dias)} día${
          Math.abs(dias) !== 1 ? "s" : ""
        }`,
      };
    if (dias === 0) return { clase: "alerta-hoy", texto: "Vence hoy" };
    if (dias <= 2)
      return {
        clase: "alerta-urgente",
        texto: `Vence en ${dias} día${dias !== 1 ? "s" : ""}`,
      };
    if (dias <= 7)
      return { clase: "alerta-proximo", texto: `Vence en ${dias} días` };
    return { clase: "alerta-ok", texto: `Vence en ${dias} días` };
  }

  function formatearMonto(valor) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(valor);
  }

  function formatFecha(fecha) {
    if (!fecha) return "-";
    return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR");
  }

  // BUSCADOR
  function buscar() {
    if (!textoBusqueda.trim()) {
      setBusquedaActiva("");
      setResultadoActual(0);
      resultadosRef.current = [];
      return;
    }
    setBusquedaActiva(textoBusqueda.trim().toLowerCase());
    setResultadoActual(0);
  }

  function limpiarBusqueda() {
    setTextoBusqueda("");
    setBusquedaActiva("");
    setResultadoActual(0);
    resultadosRef.current = [];
  }

  function irAnterior() {
    if (totalResultados === 0) return;
    setResultadoActual((prev) => (prev === 0 ? totalResultados - 1 : prev - 1));
  }

  function irSiguiente() {
    if (totalResultados === 0) return;
    setResultadoActual((prev) => (prev === totalResultados - 1 ? 0 : prev + 1));
  }

  useEffect(() => {
    if (busquedaActiva && resultadosRef.current[resultadoActual]) {
      resultadosRef.current[resultadoActual].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [resultadoActual, busquedaActiva]);

  // Separamos en próximos y futuros
  const proximos = vencimientos.filter(
    (g) => diasHastaVencimiento(g.fecha_vencimiento) <= 7
  );
  const futuros = vencimientos.filter(
    (g) => diasHastaVencimiento(g.fecha_vencimiento) > 7
  );

  // Aplicamos búsqueda sobre todos los vencimientos
  const todosParaBusqueda = [...proximos, ...futuros];
  const resultadosBusqueda = busquedaActiva
    ? todosParaBusqueda.filter((g) => {
        const desc =
          (g.es_cuota
            ? g.descripcion.split(" (")[0]
            : g.descripcion
          )?.toLowerCase() || "";
        const cat = g.categoria?.nombre?.toLowerCase() || "";
        return desc.includes(busquedaActiva) || cat.includes(busquedaActiva);
      })
    : [];

  const totalResultados = resultadosBusqueda.length;

  const totalPendiente = proximos.reduce(
    (acc, g) => acc + parseFloat(g.monto || 0),
    0
  );
  const totalFuturos = futuros.reduce(
    (acc, g) => acc + parseFloat(g.monto || 0),
    0
  );
  const vencidosCantidad = proximos.filter(
    (g) => diasHastaVencimiento(g.fecha_vencimiento) < 0
  ).length;
  const urgenteCantidad = proximos.filter((g) => {
    const d = diasHastaVencimiento(g.fecha_vencimiento);
    return d >= 0 && d <= 2;
  }).length;

  function renderTarjeta(gasto, index, esBusqueda = false) {
    const dias = diasHastaVencimiento(gasto.fecha_vencimiento);
    const alerta = obtenerAlerta(dias);
    const esCuota = gasto.es_cuota && gasto.grupo_cuota_id;
    const esResaltado = esBusqueda && index === resultadoActual;

    return (
      <div
        key={gasto.id}
        ref={
          esBusqueda
            ? (el) => {
                resultadosRef.current[index] = el;
              }
            : null
        }
        className={`vencimiento-card ${alerta.clase} ${
          esCuota ? "vencimiento-clickeable" : ""
        } ${esResaltado ? "gasto-card-resaltado" : ""}`}
        onClick={esCuota ? () => abrirDetalle(gasto) : undefined}
      >
        <div className="vencimiento-izq">
          <div className="gasto-titulo">
            <span className="gasto-nombre">
              {esCuota ? gasto.descripcion.split(" (")[0] : gasto.descripcion}
            </span>
            <span className={`badge-alerta ${alerta.clase}-badge`}>
              {alerta.texto}
            </span>
            {esCuota && (
              <span className="badge badge-cuota">
                Cuota {gasto.numero_cuota}/{gasto.total_cuotas}
              </span>
            )}
          </div>
          <span className="gasto-meta">
            {gasto.categoria?.nombre || "Sin categoría"} · Vence{" "}
            {formatFecha(gasto.fecha_vencimiento)}
            {esCuota && " · Tocá para ver el plan →"}
          </span>
        </div>
        <div className="vencimiento-der" onClick={(e) => e.stopPropagation()}>
          <span className="gasto-monto">{formatearMonto(gasto.monto)}</span>
          {!esCuota && (
            <button
              onClick={() => marcarComoPagado(gasto.id)}
              className="btn-pagar"
            >
              Marcar pagado
            </button>
          )}
        </div>
      </div>
    );
  }

  // VISTA DETALLE
  if (vista === "detalle" && grupoCuotaActivo) {
    const pendientes = detalleCuotas.filter((c) => c.estado === "pendiente");
    const pagadas = detalleCuotas.filter((c) => c.estado === "pagado");
    const totalPlan = detalleCuotas.reduce(
      (acc, c) => acc + parseFloat(c.monto || 0),
      0
    );
    const totalPagado = pagadas.reduce(
      (acc, c) => acc + parseFloat(c.monto || 0),
      0
    );
    const totalRestante = pendientes.reduce(
      (acc, c) => acc + parseFloat(c.monto || 0),
      0
    );

    return (
      <div className="container">
        <button onClick={volverALista} className="btn-volver">
          ← Volver a vencimientos
        </button>
        <h1>{grupoCuotaActivo.descripcion.split(" (")[0]}</h1>
        <p className="subtitulo">
          Plan de {grupoCuotaActivo.total_cuotas} cuotas ·{" "}
          {grupoCuotaActivo.categoria?.nombre || "Sin categoría"}
        </p>

        <div className="resumen-vencimientos">
          <div className="resumen-card resumen-total">
            <span className="resumen-label">Total del plan</span>
            <span className="resumen-monto">{formatearMonto(totalPlan)}</span>
          </div>
          <div className="resumen-card resumen-urgente">
            <span className="resumen-label">Restante</span>
            <span className="resumen-monto">
              {formatearMonto(totalRestante)}
            </span>
          </div>
          <div
            className="resumen-card"
            style={{ background: "#052e16", borderColor: "#166534" }}
          >
            <span className="resumen-label">Pagado</span>
            <span className="resumen-monto" style={{ color: "#4ade80" }}>
              {formatearMonto(totalPagado)}
            </span>
          </div>
        </div>

        {pendientes.length > 0 && (
          <>
            <h2>Pendientes</h2>
            <div className="lista" style={{ marginBottom: "24px" }}>
              {pendientes.map((cuota) => {
                const dias = diasHastaVencimiento(cuota.fecha_vencimiento);
                const alerta = obtenerAlerta(dias);
                return (
                  <div
                    key={cuota.id}
                    className={`vencimiento-card ${alerta.clase}`}
                  >
                    <div className="vencimiento-izq">
                      <div className="gasto-titulo">
                        <span className="gasto-nombre">
                          Cuota {cuota.numero_cuota} de {cuota.total_cuotas}
                        </span>
                        <span className={`badge-alerta ${alerta.clase}-badge`}>
                          {alerta.texto}
                        </span>
                      </div>
                      <span className="gasto-meta">
                        Vence {formatFecha(cuota.fecha_vencimiento)}
                      </span>
                    </div>
                    <div className="vencimiento-der">
                      <span className="gasto-monto">
                        {formatearMonto(cuota.monto)}
                      </span>
                      <button
                        onClick={() => marcarComoPagado(cuota.id)}
                        className="btn-pagar"
                      >
                        Marcar pagado
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {pagadas.length > 0 && (
          <>
            <h2>Pagadas</h2>
            <div className="lista">
              {pagadas.map((cuota) => (
                <div
                  key={cuota.id}
                  className="vencimiento-card alerta-ok"
                  style={{ opacity: 0.7 }}
                >
                  <div className="vencimiento-izq">
                    <div className="gasto-titulo">
                      <span className="gasto-nombre">
                        Cuota {cuota.numero_cuota} de {cuota.total_cuotas}
                      </span>
                      <span className="badge badge-pagado">Pagada</span>
                    </div>
                    <span className="gasto-meta">
                      Pagada el {formatFecha(cuota.fecha_pago_real)}
                    </span>
                  </div>
                  <div className="vencimiento-der">
                    <span className="gasto-monto">
                      {formatearMonto(cuota.monto)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // VISTA LISTA PRINCIPAL
  return (
    <div className="container">
      <h1>Vencimientos</h1>
      <p className="subtitulo">
        Gastos pendientes ordenados por fecha de vencimiento.
      </p>

      {/* RESUMEN */}
      {!cargando && proximos.length > 0 && (
        <div className="resumen-vencimientos">
          <div className="resumen-card resumen-total">
            <span className="resumen-label">Próximos 7 días</span>
            <span className="resumen-monto">
              {formatearMonto(totalPendiente)}
            </span>
          </div>
          {vencidosCantidad > 0 && (
            <div className="resumen-card resumen-vencido">
              <span className="resumen-label">Vencidos</span>
              <span className="resumen-numero">{vencidosCantidad}</span>
            </div>
          )}
          {urgenteCantidad > 0 && (
            <div className="resumen-card resumen-urgente">
              <span className="resumen-label">Vencen en 2 días</span>
              <span className="resumen-numero">{urgenteCantidad}</span>
            </div>
          )}
        </div>
      )}

      {/* BUSCADOR */}
      <div className="buscador-container">
        <div className="buscador-fila">
          <input
            type="text"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Buscar por descripción o categoría..."
            className="buscador-input"
          />
          <button onClick={buscar} className="btn-buscar">
            Buscar
          </button>
          {busquedaActiva && (
            <button onClick={limpiarBusqueda} className="btn-limpiar">
              ✕
            </button>
          )}
        </div>
        {busquedaActiva && (
          <div className="buscador-nav">
            <span className="buscador-resultados">
              {totalResultados === 0
                ? "Sin resultados"
                : `${resultadoActual + 1} de ${totalResultados} resultado${
                    totalResultados !== 1 ? "s" : ""
                  }`}
            </span>
            {totalResultados > 1 && (
              <div className="buscador-flechas">
                <button onClick={irAnterior} className="btn-flecha">
                  ←
                </button>
                <button onClick={irSiguiente} className="btn-flecha">
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SI HAY BÚSQUEDA ACTIVA: mostrar resultados */}
      {busquedaActiva ? (
        <>
          <h2>Resultados de búsqueda</h2>
          {totalResultados === 0 && (
            <p className="texto-vacio">No se encontraron vencimientos.</p>
          )}
          <div className="lista">
            {resultadosBusqueda.map((gasto, index) =>
              renderTarjeta(gasto, index, true)
            )}
          </div>
        </>
      ) : (
        <>
          {/* LISTADO PRÓXIMOS */}
          <h2>Vencidos y próximos 7 días</h2>
          {cargando && (
            <p className="texto-cargando">Cargando vencimientos...</p>
          )}
          {!cargando && proximos.length === 0 && (
            <p className="texto-vacio">
              ¡Sin vencimientos urgentes! Todo al día.
            </p>
          )}
          <div className="lista" style={{ marginBottom: "24px" }}>
            {proximos.map((gasto) => renderTarjeta(gasto, -1, false))}
          </div>

          {/* TARJETA FUTUROS */}
          {!cargando && futuros.length > 0 && (
            <div>
              <div
                className="futuros-card"
                onClick={() => setExpandirFuturos(!expandirFuturos)}
              >
                <div className="futuros-izq">
                  <span className="futuros-titulo">
                    📅 Vencimientos + 7 días
                  </span>
                  <span className="futuros-sub">
                    {futuros.length} gasto{futuros.length !== 1 ? "s" : ""} ·{" "}
                    {formatearMonto(totalFuturos)}
                  </span>
                </div>
                <span className="futuros-chevron">
                  {expandirFuturos ? "▲" : "▼"}
                </span>
              </div>

              {expandirFuturos && (
                <div className="lista" style={{ marginTop: "8px" }}>
                  {futuros.map((gasto) => renderTarjeta(gasto, -1, false))}
                </div>
              )}
            </div>
          )}

          {!cargando && vencimientos.length === 0 && (
            <p className="texto-vacio">
              ¡No hay gastos pendientes! Todo al día.
            </p>
          )}
        </>
      )}
    </div>
  );
}
