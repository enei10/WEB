# sum_levels_by_date.py
from pathlib import Path
import sys
import pandas as pd

CANONICAL_COLS = ["Very low", "High", "Low", "Medium", "Very high", "None", "Extreme"]

def normalize(col: str) -> str:
    # Normaliza para comparar encabezados sin importar mayúsc/minúsc y espacios
    return col.strip().casefold()

def coerce_numeric_series(s: pd.Series) -> pd.Series:
    # Convierte a numérico limpiando cualquier carácter no numérico (excepto . y -)
    s = s.astype(str).str.replace(r"[^\d\.\-]", "", regex=True)
    return pd.to_numeric(s, errors="coerce").fillna(0.0)

def read_csv_robust(csv_path: Path) -> pd.DataFrame:
    # Lectura flexible de separador y BOM
    try:
        df = pd.read_csv(csv_path, sep=None, engine="python", encoding="utf-8-sig")
    except Exception:
        df = pd.read_csv(csv_path, sep=";", encoding="utf-8-sig")

    original_cols = list(df.columns)
    df.columns = [c.strip() for c in df.columns]

    # Mapa de nombres canónicos ignorando caso/espacios
    canon_norm = {normalize(c): c for c in ["Date"] + CANONICAL_COLS}

    found = {}
    for c in df.columns:
        n = normalize(c)
        if n in canon_norm:
            found[n] = c

    # Asegurar que Date exista
    if normalize("Date") not in found:
        raise ValueError(
            f"{csv_path.name} no tiene la columna 'Date'. "
            f"Columnas encontradas: {original_cols}"
        )

    # Renombrar columnas encontradas a los nombres canónicos exactos
    rename_map = {found[normalize("Date")]: "Date"}
    for col in CANONICAL_COLS:
        if normalize(col) in found:
            rename_map[found[normalize(col)]] = col
    df = df.rename(columns=rename_map)

    # Mantener solo Date + lo que exista de las CANONICAL_COLS
    keep = ["Date"] + [c for c in CANONICAL_COLS if c in df.columns]
    df = df[keep]

    # Crear con 0 las columnas canónicas faltantes en este archivo
    missing_here = [c for c in CANONICAL_COLS if c not in df.columns]
    if missing_here:
        for m in missing_here:
            df[m] = 0.0
        # Mensaje informativo (no detiene)
        print(f"[AVISO] {csv_path.name} no trae columnas: {missing_here}. Se rellenan con 0.")

    # Convertir a numérico columnas de niveles
    for col in CANONICAL_COLS:
        df[col] = coerce_numeric_series(df[col])

    # Agrupa por Date por si el archivo repite fechas
    df = df.groupby("Date", as_index=False)[CANONICAL_COLS].sum()

    return df[["Date"] + CANONICAL_COLS]

def main(root_folder: Path, filename: str):
    if not root_folder.exists() or not root_folder.is_dir():
        raise SystemExit(f"La ruta no existe o no es carpeta: {root_folder}")

    parts = []
    processed = 0
    for sub in sorted([p for p in root_folder.iterdir() if p.is_dir()]):
        candidates = [p for p in sub.glob("*") if p.name.lower() == filename.lower()]
        if not candidates:
            continue
        csv_path = candidates[0]
        df = read_csv_robust(csv_path)
        parts.append(df)
        processed += 1

    if not parts:
        raise SystemExit(
            f"No se encontró '{filename}' en ninguna subcarpeta de: {root_folder}"
        )

    print(f"[INFO] Archivos procesados: {processed}")

    # Suma alineando por Date (unión externa) y rellenando ausentes con 0
    agg = None
    for df in parts:
        df_idx = df.set_index("Date")
        if agg is None:
            agg = df_idx.copy()
        else:
            agg = agg.add(df_idx, fill_value=0.0)

    out = agg.reset_index()

    # Ordenar por fecha si es posible
    try:
        out["_sort"] = pd.to_datetime(out["Date"], errors="raise")
        out = out.sort_values("_sort").drop(columns=["_sort"])
    except Exception:
        pass

    # Reordenar columnas exactamente como se definió
    out = out[["Date"] + CANONICAL_COLS]

    # Exportar
    stem = Path(filename).stem
    out_path = root_folder / f"SUM_{stem}.xlsx"
    out.to_excel(out_path, index=False, engine="openpyxl")

    print(f"Archivo generado: {out_path}")
    print(f"Filas: {len(out)}, Columnas: {len(out.columns)}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python sum_levels_by_date.py <ruta_carpeta_principal> <nombre_archivo.csv>")
        sys.exit(1)
    main(Path(sys.argv[1]), sys.argv[2])
