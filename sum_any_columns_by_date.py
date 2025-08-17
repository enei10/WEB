# sum_any_columns_by_date.py
from pathlib import Path
import sys
import re
import pandas as pd

def normalize_header(col: str) -> str:
    """
    Normaliza encabezados para igualar variantes:
    - quita espacios extra
    - casefold (insensible a mayúsc/minúsc)
    - unifica separadores (espacios, guiones, guiones bajos)
    """
    return re.sub(r"[\s\-_]+", " ", str(col)).strip().casefold()

def parse_number(x) -> float:
    """
    Convierte '1.234,56', '1,234.56', '(123)', '123' -> float
    - Maneja miles y decimales con coma o punto.
    - Paréntesis indican negativo.
    - Cualquier cosa no numérica -> 0.0
    """
    s = str(x).strip()
    if s == "" or s.lower() in {"na", "nan", "none", "null"}:
        return 0.0

    neg = False
    if "(" in s and ")" in s:
        neg = True
        s = s.replace("(", "").replace(")", "")

    # deja solo dígitos, coma, punto y signo -
    s = re.sub(r"[^0-9,\.\-]", "", s)

    if "," in s and "." in s:
        # Si la última coma está después del último punto: asume coma decimal (EU)
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "")      # quita miles '.'
            s = s.replace(",", ".")     # coma -> punto decimal
        else:
            s = s.replace(",", "")      # quita miles ','
    elif "," in s:
        # Una sola coma y 1-2 decimales al final -> coma decimal
        parts = s.split(",")
        if len(parts) == 2 and 1 <= len(parts[1]) <= 2:
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")      # probablemente miles
    # si solo hay '.', se asume punto decimal

    try:
        v = float(s)
    except Exception:
        v = 0.0

    return -v if neg else v

def coerce_numeric_df(df: pd.DataFrame, value_cols: list) -> pd.DataFrame:
    for c in value_cols:
        df[c] = df[c].apply(parse_number)
    return df

def read_table_robust(path: Path) -> pd.DataFrame:
    """
    Lee un archivo CSV o Excel con autodetección de separador y codificación.
    - CSV: autodetecta separador, fallback a ';' y ','.
    - XLS/XLSX: usa pandas.read_excel con openpyxl.
    """
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, engine="openpyxl")

    last_err = None
    for sep_try in (None, ";", ","):
        try:
            if sep_try is None:
                return pd.read_csv(path, sep=None, engine="python", encoding="utf-8-sig")
            else:
                return pd.read_csv(path, sep=sep_try, encoding="utf-8-sig")
        except Exception as e:
            last_err = e
            continue
    raise last_err


def process_file(csv_path: Path, canonical_map: dict) -> pd.DataFrame:
    """
    - Lee el archivo
    - Detecta columna Date (insensible a caso/espacios)
    - Renombra columnas de valores a nombres canónicos (primer nombre visto)
    - Convierte a números y agrupa por Date
    Devuelve: DataFrame con columnas ['Date'] + columnas canónicas vistas en este archivo.
    """
    df = read_table_robust(csv_path)
    original_cols = list(df.columns)
    df.columns = [str(c).strip() for c in df.columns]

    # localizar columna Date
    date_col = None
    for c in df.columns:
        if normalize_header(c) == "date":
            date_col = c
            break
    if date_col is None:
        raise ValueError(f"{csv_path.name} no tiene la columna 'Date'. Columnas: {original_cols}")

    # Separar columnas de valores
    value_cols_raw = [c for c in df.columns if c != date_col]

    # Construir/usar nombres canónicos (primer nombre encontrado para cada normalización)
    rename_map = {date_col: "Date"}
    for c in value_cols_raw:
        key = normalize_header(c)
        if key == "date":
            continue
        if key not in canonical_map:
            canonical_map[key] = c.strip()  # primer nombre visto se conserva tal cual
        rename_map[c] = canonical_map[key]

    df = df.rename(columns=rename_map)

    # Mantener 'Date' + todas las columnas de valores que quedaron
    keep_cols = ["Date"] + [canonical_map[normalize_header(c)] for c in value_cols_raw if normalize_header(c) != "date"]
    # Quitar duplicados manteniendo orden
    seen = set()
    keep_cols = [x for x in keep_cols if not (x in seen or seen.add(x))]
    df = df[keep_cols]

    # Convertir a numérico y agrupar por Date (por si hay repetidas)
    value_cols = [c for c in keep_cols if c != "Date"]
    df = coerce_numeric_df(df, value_cols)
    df = df.groupby("Date", as_index=False)[value_cols].sum()

    return df

def main(root_folder: Path, filename: str):
    if not root_folder.exists() or not root_folder.is_dir():
        raise SystemExit(f"La ruta no existe o no es carpeta: {root_folder}")

    canonical_map = {}   # normalizado -> nombre final (primer visto)
    parts = []
    processed = 0
    missing_in = []

    for sub in sorted([p for p in root_folder.iterdir() if p.is_dir()]):
        # Búsqueda case-insensitive del archivo dentro de la subcarpeta
        candidates = [p for p in sub.glob("*") if p.name.lower() == filename.lower()]
        if not candidates:
            missing_in.append(sub.name)
            continue
        csv_path = candidates[0]
        df = process_file(csv_path, canonical_map)
        parts.append(df)
        processed += 1

    if not parts:
        raise SystemExit(f"No se encontró '{filename}' en ninguna subcarpeta de: {root_folder}")

    print(f"[INFO] Archivos procesados: {processed}")
    if missing_in:
        print(f"[AVISO] Subcarpetas sin '{filename}': {missing_in}")

    # Suma incremental alineando por Date y por columnas (outer con add + fill_value=0)
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

    # Orden final: Date + columnas en el orden de primer aparición (canonical_map.values())
    ordered_value_cols = list(dict.fromkeys(canonical_map.values()))
    out = out[["Date"] + ordered_value_cols]

    # Exportar
    stem = Path(filename).stem
    out_path = root_folder / f"SUM_{stem}.xlsx"
    out.to_excel(out_path, index=False, engine="openpyxl")

    print(f"Archivo generado: {out_path}")
    print(f"Filas: {len(out)}, Columnas: {len(out.columns)}")
    print(f"Columnas de valores agregadas: {ordered_value_cols}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python sum_any_columns_by_date.py <ruta_carpeta_principal> <nombre_archivo.csv>")
        sys.exit(1)
    main(Path(sys.argv[1]), sys.argv[2])
