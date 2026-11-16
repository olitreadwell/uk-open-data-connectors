"""Uniform adapters for the 34 keyless UK data sources in the TypeScript registry."""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, quote, urlencode, urlparse
from zoneinfo import ZoneInfo

from .errors import UkSourceError, UkSourceParseError
from .fixtures import read_fixture_json, read_fixture_text
from .http import FetchText, get_json, get_text


@dataclass
class UkDataAdapter:
    """One UK data source behind a uniform interface."""

    id: str
    name: str
    auth: str
    description: str
    fetch_live: Callable[..., Any]
    parse: Callable[[Any], Any]
    load_fixture: Callable[[], Any]


@dataclass
class UkSourceProbe:
    """Result of a live verification probe against one source."""

    id: str
    name: str
    auth: str
    ok: bool
    status: str
    sample: str | None = None


def _need_dict(source: str, payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise UkSourceParseError(source, "expected a JSON object")
    return payload


def _need_list(source: str, value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise UkSourceParseError(source, f'expected "{label}" to be a list')
    return value


def _need_str(source: str, value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise UkSourceParseError(source, f'expected "{label}" to be text')
    return value


def _need_number(source: str, value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise UkSourceParseError(source, f'expected "{label}" to be a number')
    return float(value)


def _need_int(source: str, value: Any, label: str) -> int:
    number = _need_number(source, value, label)
    if not number.is_integer():
        raise UkSourceParseError(source, f'expected "{label}" to be a whole number')
    return int(number)


def _optional_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _round_half_up(value: float) -> int:
    return math.floor(value + 0.5)


def _fetch_json(
    source: str,
    url: str,
    headers: dict[str, str] | None = None,
    fetch_impl: FetchText | None = None,
) -> Any:
    return get_json(source, url, headers, fetch_impl)


_MARKUP_ENTITIES = {
    "amp": "&",
    "apos": "'",
    "gt": ">",
    "lt": "<",
    "nbsp": " ",
    "quot": '"',
}


def _decode_markup_entities(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        body = match.group(1)
        if body.lower().startswith("#x"):
            try:
                return chr(int(body[2:], 16))
            except ValueError:
                return match.group(0)
        if body.startswith("#"):
            try:
                return chr(int(body[1:], 10))
            except ValueError:
                return match.group(0)
        return _MARKUP_ENTITIES.get(body.lower(), match.group(0))

    return re.sub(r"&(#x?[0-9a-f]+|[a-z]+);", replace, text, flags=re.IGNORECASE)


def _strip_markup(markup: str) -> str:
    return re.sub(r"\s+", " ", _decode_markup_entities(re.sub(r"<[^>]*>", " ", markup))).strip()


def _read_tag(block: str, tag: str) -> str | None:
    match = re.search(rf"<{tag}\b[^>]*>([\s\S]*?)</{tag}>", block, re.IGNORECASE)
    return match.group(1) if match else None


def _read_attribute(block: str, tag: str, attribute: str) -> str | None:
    match = re.search(rf'<{tag}\b[^>]*?\b{attribute}="([^"]*)"', block, re.IGNORECASE)
    return match.group(1) if match else None


def _read_number_tag(block: str, tag: str) -> int | None:
    raw = _read_tag(block, tag)
    if raw is None:
        return None
    try:
        return int(raw.strip(), 10)
    except ValueError:
        return None


# --- Flood monitoring ------------------------------------------------------

DEFAULT_FLOOD_STATION_REFERENCE = "1029TH"


def _flood_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " / ".join(str(part) for part in value)
    return str(value)


def parse_flood_stations(payload: Any) -> list[dict[str, Any]]:
    """Parses an Environment Agency /id/stations payload into stations."""
    source = "flood-monitoring"
    data = _need_dict(source, payload)
    meta_value = data.get("meta")
    meta: dict[str, Any] = meta_value if isinstance(meta_value, dict) else {}
    publisher = _flood_text(meta.get("publisher"))
    licence = _flood_text(meta.get("licence"))
    stations: list[dict[str, Any]] = []
    for item in _need_list(source, data.get("items"), "items"):
        row = _need_dict(source, item)
        measures = []
        for raw_measure in _need_list(source, row.get("measures", []), "measures"):
            measure = _need_dict(source, raw_measure)
            measures.append(
                {
                    "id": _need_str(source, measure.get("@id"), "@id"),
                    "parameter": _need_str(source, measure.get("parameter"), "parameter"),
                    "parameterName": _need_str(
                        source, measure.get("parameterName"), "parameterName"
                    ),
                    "qualifier": _need_str(source, measure.get("qualifier"), "qualifier"),
                    "unitName": _need_str(source, measure.get("unitName"), "unitName"),
                    "periodSeconds": int(measure.get("period", 0)),
                }
            )
        stations.append(
            {
                "id": _need_str(source, row.get("@id"), "@id"),
                "notation": _need_str(source, row.get("notation"), "notation"),
                "label": _flood_text(row.get("label")),
                "riverName": _flood_text(row.get("riverName")),
                "catchmentName": _flood_text(row.get("catchmentName")),
                "publisher": publisher,
                "licence": licence,
                "latitude": row.get("lat"),
                "longitude": row.get("long"),
                "measures": measures,
            }
        )
    return stations


def parse_flood_readings(payload: Any) -> list[dict[str, Any]]:
    """Parses an Environment Agency /readings payload into readings."""
    source = "flood-monitoring"
    data = _need_dict(source, payload)
    meta_value = data.get("meta")
    meta: dict[str, Any] = meta_value if isinstance(meta_value, dict) else {}
    publisher = _flood_text(meta.get("publisher"))
    licence = _flood_text(meta.get("licence"))
    return [
        {
            "measureId": _need_str(source, _need_dict(source, item).get("measure"), "measure"),
            "dateTime": _need_str(source, _need_dict(source, item).get("dateTime"), "dateTime"),
            "value": _need_number(source, _need_dict(source, item).get("value"), "value"),
            "publisher": publisher,
            "licence": licence,
        }
        for item in _need_list(source, data.get("items"), "items")
    ]


def fetch_flood_stations(
    limit: int = 25, fetch_impl: FetchText | None = None
) -> list[dict[str, Any]]:
    """Lists monitoring stations from the Environment Agency."""
    url = f"https://environment.data.gov.uk/flood-monitoring/id/stations?_limit={limit}"
    return parse_flood_stations(_fetch_json("flood-monitoring", url, fetch_impl=fetch_impl))


def fetch_flood_station_readings(
    station_reference: str = DEFAULT_FLOOD_STATION_REFERENCE,
    limit: int = 96,
    fetch_impl: FetchText | None = None,
) -> list[dict[str, Any]]:
    """Reads the most recent readings for one station, newest first."""
    url = (
        "https://environment.data.gov.uk/flood-monitoring/id/stations/"
        f"{station_reference}/readings?_limit={limit}&_sorted"
    )
    return parse_flood_readings(_fetch_json("flood-monitoring", url, fetch_impl=fetch_impl))


# --- ONS datasets ----------------------------------------------------------

ONS_DATASETS_LIMIT = 1000
ONS_TAXONOMY_PREFIX = "https://api.beta.ons.gov.uk/v1/"


def parse_ons_datasets(payload: Any) -> list[dict[str, Any]]:
    """Parses an ONS beta API /datasets payload into catalogue records."""
    source = "ons-datasets"
    records: list[dict[str, Any]] = []
    for item in _need_list(source, _need_dict(source, payload).get("items"), "items"):
        row = _need_dict(source, item)
        links_value = row.get("links")
        links: dict[str, Any] = links_value if isinstance(links_value, dict) else {}
        taxonomy_value = links.get("taxonomy")
        taxonomy: dict[str, Any] = taxonomy_value if isinstance(taxonomy_value, dict) else {}
        href = taxonomy.get("href")
        topic_path = ""
        if isinstance(href, str):
            topic_path = href.removeprefix(ONS_TAXONOMY_PREFIX)
        records.append(
            {
                "id": _need_str(source, row.get("id"), "id"),
                "title": _need_str(source, row.get("title"), "title"),
                "state": _need_str(source, row.get("state"), "state"),
                "lastUpdatedIso": _need_str(source, row.get("last_updated"), "last_updated"),
                "isNationalStatistic": row.get("national_statistic"),
                "keywords": _need_list(source, row.get("keywords", []), "keywords"),
                "topicPath": topic_path,
            }
        )
    return records


def fetch_ons_datasets(
    limit: int = ONS_DATASETS_LIMIT, fetch_impl: FetchText | None = None
) -> list[dict[str, Any]]:
    """Lists datasets from the ONS beta API catalogue."""
    url = f"https://api.beta.ons.gov.uk/v1/datasets?limit={limit}"
    return parse_ons_datasets(_fetch_json("ons-datasets", url, fetch_impl=fetch_impl))


# --- Food hygiene ----------------------------------------------------------

FSA_AUTHORITIES_URL = "https://api.ratings.food.gov.uk/Authorities/basic"
FSA_API_VERSION_HEADER = "x-api-version"
FSA_API_VERSION = "2"


def parse_food_hygiene_authorities(payload: Any) -> list[dict[str, Any]]:
    """Parses an FSA /Authorities payload into registers."""
    source = "fsa-food-hygiene"
    schemes = {1: "fhrs", 2: "fhis"}
    authorities = []
    for item in _need_list(source, _need_dict(source, payload).get("authorities"), "authorities"):
        row = _need_dict(source, item)
        scheme_type = _need_int(source, row.get("SchemeType"), "SchemeType")
        if scheme_type not in schemes:
            raise UkSourceParseError(source, f"unknown scheme type {scheme_type}")
        authorities.append(
            {
                "localAuthorityId": _need_int(
                    source, row.get("LocalAuthorityId"), "LocalAuthorityId"
                ),
                "localAuthorityCode": _need_str(
                    source, row.get("LocalAuthorityIdCode"), "LocalAuthorityIdCode"
                ),
                "localAuthorityName": _need_str(source, row.get("Name"), "Name"),
                "establishmentCount": _need_int(
                    source, row.get("EstablishmentCount"), "EstablishmentCount"
                ),
                "scheme": schemes[scheme_type],
            }
        )
    return authorities


def fetch_food_hygiene_authorities(
    fetch_impl: FetchText | None = None,
) -> list[dict[str, Any]]:
    """Lists every local authority food hygiene register from the FSA."""
    payload = _fetch_json(
        "fsa-food-hygiene",
        FSA_AUTHORITIES_URL,
        headers={FSA_API_VERSION_HEADER: FSA_API_VERSION},
        fetch_impl=fetch_impl,
    )
    return parse_food_hygiene_authorities(payload)


# --- TfL Santander Cycles --------------------------------------------------

TFL_BIKE_POINTS_URL = "https://api.tfl.gov.uk/BikePoint"


def _tidy_station_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).replace(" ,", ",").strip()


def parse_tfl_bike_points(payload: Any) -> list[dict[str, Any]]:
    """Parses a TfL BikePoint payload into live docking stations."""
    source = "tfl-bike-points"
    if not isinstance(payload, list):
        raise UkSourceParseError(source, "expected a JSON array")
    stations = []
    for item in payload:
        place = _need_dict(source, item)
        name = _tidy_station_name(_need_str(source, place.get("commonName"), "commonName"))
        properties = {
            str(prop.get("key")): str(prop.get("value"))
            for prop in _need_list(
                source, place.get("additionalProperties"), "additionalProperties"
            )
            if isinstance(prop, dict)
        }
        if (properties.get("RemovalDate") or "").strip():
            continue
        counts = {}
        for key in ("NbDocks", "NbBikes", "NbEBikes", "NbEmptyDocks"):
            raw = properties.get(key)
            if raw is None or raw.strip() == "":
                raise UkSourceParseError(source, f"no {key} on {name}")
            try:
                counts[key] = int(float(raw))
            except ValueError as exc:
                raise UkSourceParseError(
                    source, f'{key} "{raw}" on {name} is not a number'
                ) from exc
        stations.append(
            {
                "id": _need_str(source, place.get("id"), "id"),
                "name": name,
                "dockCount": counts["NbDocks"],
                "bikeCount": counts["NbBikes"],
                "electricBikeCount": counts["NbEBikes"],
                "emptyDockCount": counts["NbEmptyDocks"],
                "temporary": properties.get("Temporary") == "true",
            }
        )
    return stations


def fetch_tfl_bike_points(
    api_key: str | None = None, fetch_impl: FetchText | None = None
) -> list[dict[str, Any]]:
    """Lists every Santander Cycles docking station from TfL."""
    url = TFL_BIKE_POINTS_URL if not api_key else f"{TFL_BIKE_POINTS_URL}?app_key={api_key}"
    return parse_tfl_bike_points(_fetch_json("tfl-bike-points", url, fetch_impl=fetch_impl))


# --- Planning Data ---------------------------------------------------------

PLANNING_DATASETS_URL = "https://www.planning.data.gov.uk/dataset.json"


def parse_planning_datasets(payload: Any) -> list[dict[str, Any]]:
    """Parses a Planning Data /dataset.json payload into datasets."""
    source = "planning-datasets"
    datasets: list[dict[str, Any]] = []
    for item in _need_list(source, _need_dict(source, payload).get("datasets"), "datasets"):
        row = _need_dict(source, item)
        if row.get("realm") != "dataset":
            continue
        datasets.append(
            {
                "dataset": _need_str(source, row.get("dataset"), "dataset"),
                "name": _need_str(source, row.get("name"), "name"),
                "entityCount": _need_int(source, row.get("entity-count"), "entity-count"),
                "themes": _need_list(source, row.get("themes", []), "themes"),
                "typology": str(row.get("typology") or ""),
                "phase": str(row.get("phase") or ""),
                "licence": str(row.get("licence") or ""),
                "attribution": str(row.get("attribution") or ""),
            }
        )
    return datasets


def fetch_planning_datasets(fetch_impl: FetchText | None = None) -> list[dict[str, Any]]:
    """Lists every dataset on the Planning Data platform."""
    return parse_planning_datasets(
        _fetch_json("planning-datasets", PLANNING_DATASETS_URL, fetch_impl=fetch_impl)
    )


# --- Ancient woodland ------------------------------------------------------

ANCIENT_WOODLAND_QUERY_URL = (
    "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/"
    "Ancient_Woodland_England/FeatureServer/0/query"
)
ANCIENT_WOODLAND_CATEGORIES = {
    "ASNW": "asnw",
    "PAWS": "paws",
    "AWP": "awp",
}
ANCIENT_WOODLAND_SIZE_BANDS = [
    ("Under 1 hectare", 0, 1, "AREA < 1"),
    ("1 to 2 hectares", 1, 2, "AREA >= 1 AND AREA < 2"),
    ("2 to 5 hectares", 2, 5, "AREA >= 2 AND AREA < 5"),
    ("5 to 10 hectares", 5, 10, "AREA >= 5 AND AREA < 10"),
    ("10 to 20 hectares", 10, 20, "AREA >= 10 AND AREA < 20"),
    ("20 to 50 hectares", 20, 50, "AREA >= 20 AND AREA < 50"),
    ("50 to 100 hectares", 50, 100, "AREA >= 50 AND AREA < 100"),
    ("100 hectares or more", 100, None, "AREA >= 100"),
]


def _arcgis_rows(source: str, response: Any) -> list[dict[str, Any]]:
    features = _need_list(source, _need_dict(source, response).get("features"), "features")
    return [
        _need_dict(source, _need_dict(source, feature).get("attributes")) for feature in features
    ]


def parse_ancient_woodland_profile(payload: Any) -> dict[str, Any]:
    """Parses the layer's statistics responses into a woodland profile."""
    source = "ancient-woodland"
    data = _need_dict(source, payload)
    totals_rows = _arcgis_rows(source, data.get("totals"))
    if not totals_rows:
        raise UkSourceParseError(source, "the totals query returned no rows")
    totals = totals_rows[0]
    record_count = _need_int(source, totals.get("recordCount"), "recordCount")
    category_counts: dict[str, int] = {"asnw": 0, "paws": 0, "awp": 0}
    category_hectares: dict[str, float] = {"asnw": 0.0, "paws": 0.0, "awp": 0.0}
    for row in _arcgis_rows(source, data.get("categoryTotals")):
        status = row.get("STATUS")
        if not isinstance(status, str):
            raise UkSourceParseError(source, f"unrecognised woodland status {status!r}")
        category_id = ANCIENT_WOODLAND_CATEGORIES.get(status)
        if category_id is None:
            raise UkSourceParseError(source, f"unrecognised woodland status {status!r}")
        category_counts[category_id] = _need_int(source, row.get("recordCount"), "recordCount")
        category_hectares[category_id] = _need_number(source, row.get("hectares"), "hectares")

    band_responses = _need_list(source, data.get("sizeBandCounts"), "sizeBandCounts")
    if len(band_responses) != len(ANCIENT_WOODLAND_SIZE_BANDS):
        raise UkSourceParseError(source, "the size band response count is wrong")
    bands: list[dict[str, Any]] = []
    for definition, response in zip(ANCIENT_WOODLAND_SIZE_BANDS, band_responses):
        band_counts = {"asnw": 0, "paws": 0, "awp": 0}
        for row in _arcgis_rows(source, response):
            band_status = row.get("STATUS")
            category_id = ANCIENT_WOODLAND_CATEGORIES.get(
                band_status if isinstance(band_status, str) else ""
            )
            if category_id is None:
                raise UkSourceParseError(
                    source, f"unrecognised woodland status {row.get('STATUS')!r}"
                )
            band_counts[category_id] = _need_int(source, row.get("recordCount"), "recordCount")
        band = {
            "label": definition[0],
            "minHectares": definition[1],
            "recordCount": sum(band_counts.values()),
            "categoryCounts": band_counts,
        }
        if definition[2] is not None:
            band["maxHectares"] = definition[2]
        bands.append(band)
    if sum(band["recordCount"] for band in bands) != record_count:
        raise UkSourceParseError(source, "the size bands do not add up to the layer total")
    return {
        "recordCount": record_count,
        "totalHectares": _need_number(source, totals.get("hectares"), "hectares"),
        "largestRecordHectares": _need_number(
            source, totals.get("largestHectares"), "largestHectares"
        ),
        "averageRecordHectares": _need_number(
            source, totals.get("averageHectares"), "averageHectares"
        ),
        "categoryCounts": category_counts,
        "categoryHectares": category_hectares,
        "sizeBands": bands,
    }


def _ancient_query(
    where: str,
    statistics: Sequence[dict[str, str]],
    group_by: str | None = None,
    fetch_impl: FetchText | None = None,
) -> Any:
    params = {
        "where": where,
        "outStatistics": json.dumps(statistics, separators=(",", ":")),
        "returnGeometry": "false",
        "f": "json",
    }
    if group_by is not None:
        params["groupByFieldsForStatistics"] = group_by
    return _fetch_json(
        "ancient-woodland",
        f"{ANCIENT_WOODLAND_QUERY_URL}?{urlencode(params)}",
        fetch_impl=fetch_impl,
    )


def fetch_ancient_woodland_profile(
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Counts England's ancient woodland from Natural England's layer."""
    count_and_area = [
        {
            "statisticType": "count",
            "onStatisticField": "OBJECTID",
            "outStatisticFieldName": "recordCount",
        },
        {"statisticType": "sum", "onStatisticField": "AREA", "outStatisticFieldName": "hectares"},
    ]
    totals_statistics = count_and_area + [
        {
            "statisticType": "max",
            "onStatisticField": "AREA",
            "outStatisticFieldName": "largestHectares",
        },
        {
            "statisticType": "avg",
            "onStatisticField": "AREA",
            "outStatisticFieldName": "averageHectares",
        },
    ]
    payload = {
        "totals": _ancient_query("1=1", totals_statistics, fetch_impl=fetch_impl),
        "categoryTotals": _ancient_query("1=1", count_and_area, "STATUS", fetch_impl=fetch_impl),
        "sizeBandCounts": [
            _ancient_query(band[3], count_and_area, "STATUS", fetch_impl=fetch_impl)
            for band in ANCIENT_WOODLAND_SIZE_BANDS
        ],
    }
    return parse_ancient_woodland_profile(payload)


# --- Bank Rate -------------------------------------------------------------

BANK_RATE_SERIES_CODE = "IUDBEDR"
BANK_RATE_CSV_URL = "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp"
BANK_RATE_FIRST_QUERY_DATE = "02/Jan/1975"
BANK_RATE_MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]


def format_bank_rate_query_date(day: date) -> str:
    """Formats a day as DD/Mon/YYYY for the Bank of England database."""
    return f"{day.day:02d}/{BANK_RATE_MONTHS[day.month - 1]}/{day.year}"


def build_bank_rate_csv_url(to_query_date: str) -> str:
    """Builds the CSV URL for the Bank Rate series up to a day."""
    query = urlencode(
        {
            "csv.x": "yes",
            "Datefrom": BANK_RATE_FIRST_QUERY_DATE,
            "Dateto": to_query_date,
            "SeriesCodes": BANK_RATE_SERIES_CODE,
            "CSVF": "TN",
            "UsingCodes": "Y",
            "VPD": "Y",
            "VFD": "N",
        }
    )
    return f"{BANK_RATE_CSV_URL}?{query}"


def parse_bank_rate_csv(csv_text: str) -> list[dict[str, Any]]:
    """Parses an IADB CSV body into daily Bank Rate readings."""
    source = "bank-rate"
    if not isinstance(csv_text, str):
        raise UkSourceParseError(source, "expected CSV text")
    rows = [row.strip() for row in csv_text.splitlines() if row.strip()]
    if not rows or rows[0].split(",")[:2] != ["DATE", BANK_RATE_SERIES_CODE]:
        raise UkSourceParseError(source, "the body does not name the Bank Rate series")
    observations = []
    previous = ""
    for row in rows[1:]:
        parts = row.split(",")
        if len(parts) != 2:
            raise UkSourceParseError(source, "expected a date and a rate")
        raw_date, raw_rate = parts
        pieces = raw_date.split(" ")
        if len(pieces) != 3 or pieces[1] not in BANK_RATE_MONTHS:
            raise UkSourceParseError(source, f'"{raw_date}" is not a database date')
        day, month_name, year = pieces
        if not re.fullmatch(r"\d{1,2}", day) or not re.fullmatch(r"\d{4}", year):
            raise UkSourceParseError(source, f'"{raw_date}" is not a database date')
        iso_date = f"{year}-{BANK_RATE_MONTHS.index(month_name) + 1:02d}-{int(day):02d}"
        if iso_date <= previous:
            raise UkSourceParseError(source, "the dates do not follow forwards")
        previous = iso_date
        if raw_rate.strip() == "":
            raise UkSourceParseError(source, "the row carries no rate")
        try:
            rate = float(raw_rate)
        except ValueError as exc:
            raise UkSourceParseError(source, "the row carries no rate") from exc
        observations.append({"date": iso_date, "ratePercent": rate})
    if not observations:
        raise UkSourceParseError(source, "the series carried no readings")
    return observations


def fetch_bank_rate_observations(
    now: datetime | None = None, fetch_impl: FetchText | None = None
) -> list[dict[str, Any]]:
    """Reads the Bank Rate series from the Bank of England's database."""
    today = (now or datetime.now(timezone.utc)).date()
    url = build_bank_rate_csv_url(format_bank_rate_query_date(today))
    return parse_bank_rate_csv(get_text("bank-rate", url, fetch_impl=fetch_impl))


# --- Police recorded crime -------------------------------------------------

POLICE_API_BASE_URL = "https://data.police.uk/api"
POLICE_STREET_CRIMES_URL = f"{POLICE_API_BASE_URL}/crimes-street/all-crime"
POLICE_STREET_DATES_URL = f"{POLICE_API_BASE_URL}/crimes-street-dates"
POLICE_CRIME_CATEGORIES_URL = f"{POLICE_API_BASE_URL}/crime-categories"
DEFAULT_POLICE_CRIME_LATITUDE = 53.7997
DEFAULT_POLICE_CRIME_LONGITUDE = -1.5492
DEFAULT_POLICE_CRIME_LOCATION: dict[str, Any] = {
    "label": "Leeds city centre",
    "latitude": DEFAULT_POLICE_CRIME_LATITUDE,
    "longitude": DEFAULT_POLICE_CRIME_LONGITUDE,
}


def _count_by_category(
    records: Sequence[dict[str, Any]], names_by_slug: dict[str, str]
) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for record in records:
        slug = str(record["category"])
        counts[slug] = counts.get(slug, 0) + 1
    return sorted(
        [
            {"slug": slug, "name": names_by_slug.get(slug, slug), "recordCount": count}
            for slug, count in counts.items()
        ],
        key=lambda item: (-item["recordCount"], item["name"]),
    )


def _count_by_outcome(records: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str | None, int] = {}
    for record in records:
        outcome = record.get("outcomeCategory")
        counts[outcome] = counts.get(outcome, 0) + 1
    return sorted(
        [{"outcome": outcome, "recordCount": count} for outcome, count in counts.items()],
        key=lambda item: (-item["recordCount"], item["outcome"] or ""),
    )


def parse_police_crime_summary(payload: Any) -> dict[str, Any]:
    """Parses police.uk category and monthly response payloads into counts."""
    source = "police-crimes"
    data = _need_dict(source, payload)
    categories = _need_list(source, data.get("categories"), "categories")
    months = _need_list(source, data.get("months"), "months")
    if not months:
        raise UkSourceParseError(source, "the window covers no months")
    names_by_slug: dict[str, str] = {}
    for item in categories:
        category = _need_dict(source, item)
        slug = _need_str(source, category.get("url"), "url")
        if slug not in names_by_slug:
            names_by_slug[slug] = _need_str(source, category.get("name"), "name")
    ordered = sorted(
        (_need_dict(source, item) for item in months), key=lambda row: str(row.get("month"))
    )
    all_records: list[dict[str, Any]] = []
    month_counts: list[dict[str, Any]] = []
    previous_month = ""
    for entry in ordered:
        month = _need_str(source, entry.get("month"), "month")
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            raise UkSourceParseError(source, f"expected a month as YYYY-MM, got {month!r}")
        if month == previous_month:
            raise UkSourceParseError(source, f"two answers for {month}")
        previous_month = month
        records = _need_list(source, entry.get("records"), "records")
        if not records:
            raise UkSourceParseError(source, f"the API returned no records for {month}")
        counted = []
        for raw_record in records:
            record = _need_dict(source, raw_record)
            if record.get("month") != month:
                raise UkSourceParseError(source, f"a record under {month} carries another month")
            slug = _need_str(source, record.get("category"), "category")
            if slug not in names_by_slug:
                raise UkSourceParseError(source, f"unrecognised crime type {slug!r}")
            outcome_status = record.get("outcome_status")
            outcome = (
                _need_str(source, outcome_status.get("category"), "outcome_status.category")
                if isinstance(outcome_status, dict)
                else None
            )
            counted.append({"category": slug, "outcomeCategory": outcome})
        all_records.extend(counted)
        month_counts.append(
            {
                "month": month,
                "recordCount": len(counted),
                "categoryCounts": _count_by_category(counted, names_by_slug),
            }
        )
    by_month_size = sorted(month_counts, key=lambda item: (-item["recordCount"], item["month"]))
    category_counts = _count_by_category(all_records, names_by_slug)
    outcome_counts = _count_by_outcome(all_records)
    return {
        "monthCount": len(month_counts),
        "recordCount": len(all_records),
        "firstMonth": month_counts[0]["month"],
        "latestMonth": month_counts[-1]["month"],
        "categoryCounts": category_counts,
        "outcomeCounts": outcome_counts,
        "months": month_counts,
        "busiestMonth": by_month_size[0],
        "quietestMonth": by_month_size[-1],
        "topCategory": category_counts[0],
        "topOutcome": outcome_counts[0],
    }


def build_police_street_crimes_url(latitude: float, longitude: float, month: str) -> str:
    """Builds the street-level crime URL for one point and one month."""
    query = urlencode({"lat": latitude, "lng": longitude, "date": month})
    return f"{POLICE_STREET_CRIMES_URL}?{query}"


def fetch_police_crime_summary(
    month_count: int = 12, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Counts recorded crime within a mile of Leeds city centre."""
    dates = _fetch_json("police-crimes", POLICE_STREET_DATES_URL, fetch_impl=fetch_impl)
    months = [
        str(entry.get("date"))
        for entry in _need_list("police-crimes", dates, "dates")
        if re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(entry.get("date")))
    ]
    categories = _fetch_json("police-crimes", POLICE_CRIME_CATEGORIES_URL, fetch_impl=fetch_impl)
    responses: list[dict[str, Any]] = []
    for month in months[:month_count]:
        url = build_police_street_crimes_url(
            DEFAULT_POLICE_CRIME_LATITUDE,
            DEFAULT_POLICE_CRIME_LONGITUDE,
            month,
        )
        responses.append(
            {"month": month, "records": _fetch_json("police-crimes", url, fetch_impl=fetch_impl)}
        )
    return parse_police_crime_summary({"categories": categories, "months": responses})


# --- Carbon intensity ------------------------------------------------------

CARBON_INTENSITY_RANGE_URL = "https://api.carbonintensity.org.uk/intensity"
CARBON_INTENSITY_INDEX_BANDS = ["very low", "low", "moderate", "high", "very high"]
_CARBON_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$")


def _instant(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)


def resolve_carbon_intensity_window(
    window_days: int = 30, now: datetime | None = None
) -> dict[str, str]:
    """Works out a whole-day UTC window ending at the start of yesterday."""
    if window_days < 1 or window_days > 30:
        raise UkSourceParseError("carbon-intensity", "the window must be between 1 and 30 days")
    moment = now or datetime.now(timezone.utc)
    today = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    to = today - timedelta(days=1)
    start = to - timedelta(days=window_days)
    return {
        "from": start.strftime("%Y-%m-%dT%H:%MZ"),
        "to": to.strftime("%Y-%m-%dT%H:%MZ"),
    }


def build_carbon_intensity_window_url(window: dict[str, str]) -> str:
    """Builds the URL for one carbon intensity window."""
    return f"{CARBON_INTENSITY_RANGE_URL}/{window['from']}/{window['to']}"


def parse_carbon_intensity_window(payload: Any) -> dict[str, Any]:
    """Parses a carbon intensity range response into a summary window."""
    source = "carbon-intensity"
    responses = _need_list(source, _need_dict(source, payload).get("data"), "data")
    if not responses:
        raise UkSourceParseError(source, "the window returned no readings")
    periods: list[dict[str, Any]] = []
    previous_from: datetime | None = None
    for raw in responses:
        row = _need_dict(source, raw)
        start_text = _need_str(source, row.get("from"), "from")
        end_text = _need_str(source, row.get("to"), "to")
        if not _CARBON_INSTANT.fullmatch(start_text) or not _CARBON_INSTANT.fullmatch(end_text):
            raise UkSourceParseError(source, "expected an instant as YYYY-MM-DDThh:mmZ")
        start, end = _instant(start_text), _instant(end_text)
        if end - start != timedelta(minutes=30):
            raise UkSourceParseError(
                source, f"the half hour starting {start_text} is not 30 minutes"
            )
        if previous_from is not None and start <= previous_from:
            raise UkSourceParseError(source, f"the readings do not move forwards at {start_text}")
        previous_from = start
        intensity = _need_dict(source, row.get("intensity"))
        actual = intensity.get("actual")
        if actual is None:
            raise UkSourceParseError(source, f"the half hour starting {start_text} has no actual")
        index = _need_str(source, intensity.get("index"), "index")
        if index not in CARBON_INTENSITY_INDEX_BANDS:
            raise UkSourceParseError(source, f"unrecognised intensity grade {index!r}")
        periods.append(
            {
                "from": start_text,
                "to": end_text,
                "intensity": _need_number(source, actual, "actual"),
                "index": index,
            }
        )
    lowest = min(periods, key=lambda item: item["intensity"])
    highest = max(periods, key=lambda item: item["intensity"])
    total = sum(item["intensity"] for item in periods)
    return {
        "periodCount": len(periods),
        "dayCount": len(periods) // 48,
        "firstPeriodFrom": periods[0]["from"],
        "lastPeriodTo": periods[-1]["to"],
        "averageIntensity": _round_half_up(total / len(periods)),
        "lowestPeriod": lowest,
        "highestPeriod": highest,
        "bandCounts": [
            {"index": band, "periodCount": sum(1 for item in periods if item["index"] == band)}
            for band in CARBON_INTENSITY_INDEX_BANDS
        ],
        "periods": periods,
    }


def fetch_carbon_intensity_window(
    fetch_impl: FetchText | None = None, now: datetime | None = None
) -> dict[str, Any]:
    """Reads a window of half-hourly carbon intensity."""
    window = resolve_carbon_intensity_window(now=now)
    payload = _fetch_json(
        "carbon-intensity", build_carbon_intensity_window_url(window), fetch_impl=fetch_impl
    )
    data = _need_dict("carbon-intensity", payload)
    start = _instant(window["from"])
    filtered = [
        item
        for item in _need_list("carbon-intensity", data.get("data"), "data")
        if isinstance(item, dict)
        and isinstance(item.get("from"), str)
        and _instant(item["from"]) >= start
    ]
    return parse_carbon_intensity_window({"data": filtered})


# --- Parliament seats ------------------------------------------------------

PARLIAMENT_MEMBERS_API_BASE_URL = "https://members-api.parliament.uk/api"


def parse_parliament_seats(payload: Any) -> dict[str, Any]:
    """Parses a state-of-the-parties payload into seat totals and rankings."""
    source = "parliament-seats"
    items = _need_list(source, _need_dict(source, payload).get("items"), "items")
    if not items:
        raise UkSourceParseError(source, "the house returned no parties")
    seats: list[dict[str, Any]] = []
    seen = set()
    for raw_item in items:
        item = _need_dict(source, raw_item)
        value = item.get("value")
        if not isinstance(value, dict):
            raise UkSourceParseError(source, "a party row carried no seat count")
        party = value.get("party")
        if not isinstance(party, dict):
            raise UkSourceParseError(source, "a party row carried no party")
        name = str(party.get("name") or "").strip()
        if not name:
            raise UkSourceParseError(source, "a party row carried no name")
        party_id = _need_int(source, party.get("id"), "id")
        if party_id in seen:
            raise UkSourceParseError(source, f"{name} is listed more than once")
        seen.add(party_id)
        total = _need_int(source, value.get("total"), "total")
        if total <= 0:
            raise UkSourceParseError(source, f"{name} holds {total} seats")
        male = int(value.get("male") or 0)
        female = int(value.get("female") or 0)
        non_binary = int(value.get("nonBinary") or 0)
        member_count = male + female + non_binary
        if member_count > total:
            raise UkSourceParseError(source, f"{name} names more members than seats")
        seats.append(
            {
                "party": {
                    "id": party_id,
                    "name": name,
                    "abbreviation": str(party.get("abbreviation") or "").strip(),
                    "backgroundColour": party.get("backgroundColour"),
                    "foregroundColour": party.get("foregroundColour"),
                    "isIndependent": bool(party.get("isIndependentParty")),
                },
                "seatCount": total,
                "maleCount": male,
                "femaleCount": female,
                "nonBinaryCount": non_binary,
                "unallocatedSeatCount": total - member_count,
            }
        )
    ordered = sorted(seats, key=lambda item: (-item["seatCount"], item["party"]["name"]))
    seat_count = sum(item["seatCount"] for item in seats)
    return {
        "seatCount": seat_count,
        "partyCount": len(ordered),
        "majorityThreshold": seat_count // 2 + 1,
        "partiesWithOneSeat": sum(1 for item in ordered if item["seatCount"] == 1),
        "seats": ordered,
        "largestParty": ordered[0],
    }


def fetch_parliament_seats(fetch_impl: FetchText | None = None) -> dict[str, Any]:
    """Reads the state of the parties in the House of Commons."""
    today = datetime.now(ZoneInfo("Europe/London")).date().isoformat()
    url = f"{PARLIAMENT_MEMBERS_API_BASE_URL}/Parties/StateOfTheParties/1/{today}"
    return parse_parliament_seats(
        _fetch_json(
            "parliament-seats", url, headers={"accept": "application/json"}, fetch_impl=fetch_impl
        )
    )


# --- Postcode lookup -------------------------------------------------------

POSTCODES_IO_BASE_URL = "https://api.postcodes.io/postcodes/"


def build_postcode_lookup_url(postcode: str) -> str:
    """Builds the postcodes.io lookup URL for one postcode."""
    from urllib.parse import quote

    return f"{POSTCODES_IO_BASE_URL}{quote(postcode, safe='')}"


def parse_postcode_lookup(payload: Any) -> dict[str, Any]:
    """Parses a postcodes.io single postcode payload."""
    source = "postcode-lookup"
    result = _need_dict(source, _need_dict(source, payload).get("result"))
    return {
        "postcode": _need_str(source, result.get("postcode"), "postcode"),
        "country": _need_str(source, result.get("country"), "country"),
        "region": result.get("region"),
        "adminDistrict": result.get("admin_district"),
        "adminWard": result.get("admin_ward"),
        "parliamentaryConstituency": result.get("parliamentary_constituency"),
        "latitude": _need_number(source, result.get("latitude"), "latitude"),
        "longitude": _need_number(source, result.get("longitude"), "longitude"),
        "nhsHa": result.get("nhs_ha"),
    }


def fetch_postcode_lookup(
    postcode: str = "SW1A1AA", fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Looks up one postcode with postcodes.io."""
    return parse_postcode_lookup(
        _fetch_json("postcode-lookup", build_postcode_lookup_url(postcode), fetch_impl=fetch_impl)
    )


# --- Explore Education Statistics -----------------------------------------

EXPLORE_EDUCATION_PUBLICATIONS_URL = "https://api.education.gov.uk/statistics/v1/publications"


def parse_explore_education_publications(payload: Any) -> dict[str, Any]:
    """Parses an Explore Education Statistics publications payload."""
    source = "explore-education-statistics"
    data = _need_dict(source, payload)
    paging = _need_dict(source, data.get("paging"))
    return {
        "page": _need_int(source, paging.get("page"), "page"),
        "pageSize": _need_int(source, paging.get("pageSize"), "pageSize"),
        "totalResults": _need_int(source, paging.get("totalResults"), "totalResults"),
        "totalPages": _need_int(source, paging.get("totalPages"), "totalPages"),
        "publications": [
            {
                "id": _need_str(source, _need_dict(source, item).get("id"), "id"),
                "title": _need_str(source, _need_dict(source, item).get("title"), "title"),
                "slug": _need_str(source, _need_dict(source, item).get("slug"), "slug"),
                "summary": str(_need_dict(source, item).get("summary") or ""),
                "lastPublishedIso": _need_str(
                    source, _need_dict(source, item).get("lastPublished"), "lastPublished"
                ),
            }
            for item in _need_list(source, data.get("results"), "results")
        ],
    }


def fetch_explore_education_publications(
    page: int = 1, page_size: int = 20, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Lists one page of Explore Education Statistics publications."""
    url = f"{EXPLORE_EDUCATION_PUBLICATIONS_URL}?page={page}&pageSize={page_size}"
    return parse_explore_education_publications(
        _fetch_json("explore-education-statistics", url, fetch_impl=fetch_impl)
    )


# --- Small CKAN catalogues -------------------------------------------------


def _parse_package_list(source: str, payload: Any) -> list[dict[str, str]]:
    data = _need_dict(source, payload)
    return [
        {"name": _need_str(source, name, "package name")}
        for name in _need_list(source, data.get("result"), "result")
    ]


def parse_london_datastore_packages(payload: Any) -> list[dict[str, str]]:
    """Parses a London Datastore package_list payload."""
    return _parse_package_list("london-datastore", payload)


def fetch_london_datastore_packages(fetch_impl: FetchText | None = None) -> list[dict[str, str]]:
    """Lists every dataset in the London Datastore catalogue."""
    url = "https://data.london.gov.uk/api/3/action/package_list"
    return parse_london_datastore_packages(
        _fetch_json("london-datastore", url, fetch_impl=fetch_impl)
    )


def parse_public_health_scotland_datasets(payload: Any) -> list[dict[str, str]]:
    """Parses a Public Health Scotland package_list payload."""
    return _parse_package_list("public-health-scotland", payload)


def fetch_public_health_scotland_datasets(
    fetch_impl: FetchText | None = None,
) -> list[dict[str, str]]:
    """Lists every dataset in the Public Health Scotland catalogue."""
    url = "https://www.opendata.nhs.scot/api/3/action/package_list"
    return parse_public_health_scotland_datasets(
        _fetch_json("public-health-scotland", url, fetch_impl=fetch_impl)
    )


def parse_nhsbsa_ckan_packages(payload: Any) -> list[dict[str, str]]:
    """Parses an NHSBSA package_list payload."""
    return _parse_package_list("nhsbsa-ckan", payload)


def fetch_nhsbsa_ckan_packages(fetch_impl: FetchText | None = None) -> list[dict[str, str]]:
    """Lists every dataset in the NHSBSA catalogue."""
    url = "https://opendata.nhsbsa.net/api/3/action/package_list"
    return parse_nhsbsa_ckan_packages(_fetch_json("nhsbsa-ckan", url, fetch_impl=fetch_impl))


# --- TNA Discovery ---------------------------------------------------------

TNA_DISCOVERY_SEARCH_URL = "https://discovery.nationalarchives.gov.uk/API/search/records"


def parse_tna_discovery_records(payload: Any) -> dict[str, Any]:
    """Parses a Discovery record search payload."""
    source = "tna-discovery"
    data = _need_dict(source, payload)
    records: list[dict[str, Any]] = []
    for item in _need_list(source, data.get("records"), "records"):
        row = _need_dict(source, item)
        records.append(
            {
                "id": _need_str(source, row.get("id"), "id"),
                "reference": str(row.get("reference") or ""),
                "title": str(row.get("title") or ""),
                "description": str(row.get("description") or ""),
                "coveringDates": str(row.get("coveringDates") or ""),
                "catalogueLevel": row.get("catalogueLevel"),
                "department": str(row.get("department") or ""),
                "heldBy": _need_list(source, row.get("heldBy") or [], "heldBy"),
            }
        )
    return {"totalCount": _need_int(source, data.get("count"), "count"), "records": records}


def fetch_tna_discovery_records(fetch_impl: FetchText | None = None) -> dict[str, Any]:
    """Searches the Discovery catalogue for the default query."""
    url = f"{TNA_DISCOVERY_SEARCH_URL}?sps.searchQuery=test"
    return parse_tna_discovery_records(
        _fetch_json(
            "tna-discovery", url, headers={"Accept": "application/json"}, fetch_impl=fetch_impl
        )
    )


# --- UKHSA dashboard -------------------------------------------------------

UKHSA_DASHBOARD_API_BASE_URL = "https://api.ukhsa-dashboard.data.gov.uk"
UKHSA_DASHBOARD_METRIC_PATH = (
    "/themes/infectious_disease/sub_themes/bloodborne/topics/HIV"
    "/geography_types/Nation/geographies/England/metrics/HIV_cases_newDiagnoses"
)


def parse_ukhsa_metric_points(payload: Any) -> dict[str, Any]:
    """Parses a UKHSA dashboard metric payload."""
    source = "ukhsa-dashboard"
    data = _need_dict(source, payload)
    points = []
    for item in _need_list(source, data.get("results"), "results"):
        row = _need_dict(source, item)
        points.append(
            {
                "theme": _need_str(source, row.get("theme"), "theme"),
                "subTheme": _need_str(source, row.get("sub_theme"), "sub_theme"),
                "topic": _need_str(source, row.get("topic"), "topic"),
                "geographyType": _need_str(source, row.get("geography_type"), "geography_type"),
                "geography": _need_str(source, row.get("geography"), "geography"),
                "geographyCode": str(row.get("geography_code") or ""),
                "metric": _need_str(source, row.get("metric"), "metric"),
                "metricGroup": str(row.get("metric_group") or ""),
                "stratum": str(row.get("stratum") or ""),
                "sex": _need_str(source, row.get("sex"), "sex"),
                "age": _need_str(source, row.get("age"), "age"),
                "year": _need_int(source, row.get("year"), "year"),
                "month": row.get("month"),
                "epiweek": row.get("epiweek"),
                "date": _need_str(source, row.get("date"), "date"),
                "metricValue": row.get("metric_value"),
                "inReportingDelayPeriod": bool(row.get("in_reporting_delay_period")),
            }
        )
    return {"totalCount": _need_int(source, data.get("count"), "count"), "points": points}


def fetch_ukhsa_metric_points(
    page_size: int = 10, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Reads one page of UKHSA dashboard metric points."""
    url = f"{UKHSA_DASHBOARD_API_BASE_URL}{UKHSA_DASHBOARD_METRIC_PATH}?page_size={page_size}"
    return parse_ukhsa_metric_points(_fetch_json("ukhsa-dashboard", url, fetch_impl=fetch_impl))


# --- Nomis ----------------------------------------------------------------

NOMIS_DATASET_DEFINITIONS_URL = "https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json"


def _nomis_annotation(annotations: Sequence[Any], title: str) -> str:
    for raw in annotations:
        if not isinstance(raw, dict):
            continue
        if raw.get("annotationtitle") == title:
            value = raw.get("annotationtext")
            if value is None:
                return ""
            if isinstance(value, bool):
                return "true" if value else "false"
            return str(value)
    return ""


def parse_nomis_dataset_definitions(payload: Any) -> list[dict[str, Any]]:
    """Parses a Nomis SDMX dataset definitions payload."""
    source = "nomis"
    structure = _need_dict(source, _need_dict(source, payload).get("structure"))
    keyfamilies = structure.get("keyfamilies")
    rows = [] if not isinstance(keyfamilies, dict) else keyfamilies.get("keyfamily") or []
    definitions = []
    for raw in _need_list(source, rows, "keyfamily"):
        row = _need_dict(source, raw)
        annotations_box = row.get("annotations")
        annotations = (
            annotations_box.get("annotation") or [] if isinstance(annotations_box, dict) else []
        )
        name = row.get("name")
        definitions.append(
            {
                "id": _need_str(source, row.get("id"), "id"),
                "name": str(name.get("value") or "") if isinstance(name, dict) else "",
                "agencyId": _need_str(source, row.get("agencyid"), "agencyid"),
                "version": _need_int(source, row.get("version"), "version"),
                "uri": _need_str(source, row.get("uri"), "uri"),
                "status": _nomis_annotation(annotations, "Status"),
                "keywords": _nomis_annotation(annotations, "Keywords"),
                "units": _nomis_annotation(annotations, "Units"),
                "lastUpdated": _nomis_annotation(annotations, "LastUpdated"),
            }
        )
    return definitions


def fetch_nomis_dataset_definitions(fetch_impl: FetchText | None = None) -> list[dict[str, Any]]:
    """Lists every dataset definition in the Nomis SDMX catalogue."""
    return parse_nomis_dataset_definitions(
        _fetch_json("nomis", NOMIS_DATASET_DEFINITIONS_URL, fetch_impl=fetch_impl)
    )


# --- Fingertips -----------------------------------------------------------

FINGERTIPS_INDICATOR_METADATA_URL = (
    "https://fingertips.phe.org.uk/api/indicator_metadata/by_indicator_id"
)


def parse_fingertips_indicators(payload: Any) -> list[dict[str, Any]]:
    """Parses a Fingertips indicator metadata payload."""
    source = "fingertips-indicators"
    data = _need_dict(source, payload)
    indicators = []
    for raw in data.values():
        row = _need_dict(source, raw)
        descriptive = row.get("Descriptive")
        unit = row.get("Unit")
        value_type = row.get("ValueType")
        year_type = row.get("YearType")
        data_change = row.get("DataChange")
        indicators.append(
            {
                "indicatorId": _need_int(source, row.get("IID"), "IID"),
                "name": str(descriptive.get("Name") or "") if isinstance(descriptive, dict) else "",
                "dataSource": (
                    str(descriptive.get("DataSource") or "")
                    if isinstance(descriptive, dict)
                    else ""
                ),
                "unitLabel": str(unit.get("Label") or "") if isinstance(unit, dict) else "",
                "valueType": str(value_type.get("Name") or "")
                if isinstance(value_type, dict)
                else "",
                "yearType": str(year_type.get("Name") or "") if isinstance(year_type, dict) else "",
                "lastUploadedAt": (
                    str(data_change.get("LastUploadedAt") or "")
                    if isinstance(data_change, dict)
                    else ""
                ),
                "latestChangeTimestampOverride": str(
                    row.get("LatestChangeTimestampOverride") or ""
                ),
            }
        )
    return indicators


def fetch_fingertips_indicators(
    indicator_ids: Sequence[int] = (90366,), fetch_impl: FetchText | None = None
) -> list[dict[str, Any]]:
    """Reads metadata for a set of Fingertips public health indicators."""
    ids = ",".join(str(value) for value in indicator_ids)
    url = f"{FINGERTIPS_INDICATOR_METADATA_URL}?indicator_ids={ids}"
    return parse_fingertips_indicators(
        _fetch_json("fingertips-indicators", url, fetch_impl=fetch_impl)
    )


# --- Find a Tender --------------------------------------------------------

FIND_A_TENDER_RELEASE_PACKAGES_URL = (
    "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"
)


def parse_find_a_tender_releases(payload: Any) -> dict[str, Any]:
    """Parses an OCDS release packages payload into releases."""
    source = "find-a-tender"
    data = _need_dict(source, payload)
    publisher_value = data.get("publisher")
    publisher_box: dict[str, Any] = (
        publisher_value if isinstance(publisher_value, dict) else {}
    )
    publisher = str(publisher_box.get("name") or "").strip()
    license_value = data.get("license")
    licence = license_value.strip() if isinstance(license_value, str) else ""
    releases: list[dict[str, Any]] = []
    for raw in _need_list(source, data.get("releases"), "releases"):
        row = _need_dict(source, raw)
        tender_value = row.get("tender")
        tender: dict[str, Any] = tender_value if isinstance(tender_value, dict) else {}
        buyer_value = row.get("buyer")
        buyer: dict[str, Any] = buyer_value if isinstance(buyer_value, dict) else {}
        tender_value_box = tender.get("value")
        value: dict[str, Any] = tender_value_box if isinstance(tender_value_box, dict) else {}
        releases.append(
            {
                "ocid": _need_str(source, row.get("ocid"), "ocid"),
                "id": _need_str(source, row.get("id"), "id"),
                "date": _need_str(source, row.get("date"), "date"),
                "tags": _need_list(source, row.get("tag") or [], "tag"),
                "tenderTitle": str(tender.get("title") or ""),
                "tenderStatus": str(tender.get("status") or ""),
                "procurementMethod": str(tender.get("procurementMethod") or ""),
                "buyerName": str(buyer.get("name") or ""),
                "tenderValueAmount": value.get("amount"),
                "publisher": publisher,
                "licence": licence,
            }
        )
    return {
        "uri": _need_str(source, data.get("uri"), "uri"),
        "version": _need_str(source, data.get("version"), "version"),
        "publishedDate": _need_str(source, data.get("publishedDate"), "publishedDate"),
        "releases": releases,
    }


def fetch_find_a_tender_releases(
    limit: int = 10, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Lists the most recent Find a Tender release packages."""
    return parse_find_a_tender_releases(
        _fetch_json(
            "find-a-tender",
            f"{FIND_A_TENDER_RELEASE_PACKAGES_URL}?limit={limit}",
            fetch_impl=fetch_impl,
        )
    )


# --- TfL line status ------------------------------------------------------

TFL_LINE_STATUS_URL = "https://api.tfl.gov.uk/Line/Mode/tube/Status"


def parse_tfl_line_statuses(payload: Any) -> list[dict[str, Any]]:
    """Parses a TfL line status payload into one record per line."""
    source = "tfl-line-status"
    if not isinstance(payload, list):
        raise UkSourceParseError(source, "expected a JSON array")
    lines = []
    for raw in payload:
        row = _need_dict(source, raw)
        statuses = _need_list(source, row.get("lineStatuses"), "lineStatuses")
        if not statuses:
            raise UkSourceParseError(source, "a line carried no status")
        status = _need_dict(source, statuses[0])
        lines.append(
            {
                "id": _need_str(source, row.get("id"), "id"),
                "name": _need_str(source, row.get("name"), "name"),
                "modeName": _need_str(source, row.get("modeName"), "modeName"),
                "statusSeverity": _need_int(source, status.get("statusSeverity"), "statusSeverity"),
                "statusSeverityDescription": _need_str(
                    source, status.get("statusSeverityDescription"), "statusSeverityDescription"
                ),
                "reason": str(status.get("reason") or ""),
            }
        )
    return lines


def fetch_tfl_line_statuses(
    api_key: str | None = None, fetch_impl: FetchText | None = None
) -> list[dict[str, Any]]:
    """Reads the live status of every Tube line from TfL."""
    url = TFL_LINE_STATUS_URL if not api_key else f"{TFL_LINE_STATUS_URL}?app_key={api_key}"
    return parse_tfl_line_statuses(_fetch_json("tfl-line-status", url, fetch_impl=fetch_impl))


# --- NESO generation mix --------------------------------------------------

NESO_DATASTORE_SEARCH_URL = "https://api.neso.energy/api/3/action/datastore_search"
NESO_GENERATION_MIX_RESOURCE_ID = "f93d1835-75bc-43e5-84ad-12472b180a98"
NESO_GENERATION_FUELS = [
    "GAS",
    "COAL",
    "NUCLEAR",
    "WIND",
    "WIND_EMB",
    "HYDRO",
    "IMPORTS",
    "BIOMASS",
    "OTHER",
    "SOLAR",
    "STORAGE",
]
_NESO_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:(00|30):00$")


def build_neso_generation_mix_url(
    half_hours: int = 336, resource_id: str = NESO_GENERATION_MIX_RESOURCE_ID
) -> str:
    """Builds the datastore URL for one window of half hours."""
    if half_hours < 1 or half_hours > 3360:
        raise UkSourceParseError("neso-generation-mix", "the half-hour window is outside 1 to 3360")
    return f"{NESO_DATASTORE_SEARCH_URL}?" + urlencode(
        {"resource_id": resource_id, "sort": "DATETIME desc", "limit": half_hours}
    )


def parse_neso_generation_mix(payload: Any) -> dict[str, Any]:
    """Parses a NESO datastore response into a generation mix window."""
    source = "neso-generation-mix"
    data = _need_dict(source, payload)
    if not data.get("success"):
        raise UkSourceParseError(source, "the datastore reported a failure")
    result = _need_dict(source, data.get("result"))
    records = _need_list(source, result.get("records"), "records")
    if not records:
        raise UkSourceParseError(source, "the window returned no half hours")
    half_hours: list[dict[str, Any]] = []
    seen = set()
    for raw in records:
        row = _need_dict(source, raw)
        moment = _need_str(source, row.get("DATETIME"), "DATETIME")
        if not _NESO_DATETIME.fullmatch(moment):
            raise UkSourceParseError(source, f"expected a half hour, got {moment!r}")
        if moment in seen:
            raise UkSourceParseError(source, f"two rows for the half hour starting {moment}")
        seen.add(moment)
        generation = _need_number(source, row.get("GENERATION"), "GENERATION")
        carbon = _need_number(source, row.get("CARBON_INTENSITY"), "CARBON_INTENSITY")
        if generation <= 0 or carbon <= 0:
            raise UkSourceParseError(
                source, f"the half hour starting {moment} has no positive total"
            )
        half_hours.append(
            {
                "datetime": moment,
                "totalMegawatts": generation,
                "carbonIntensity": carbon,
                "lowCarbonMegawatts": _need_number(source, row.get("LOW_CARBON"), "LOW_CARBON"),
                "fuels": [
                    {"fuel": fuel, "megawatts": _need_number(source, row.get(fuel), fuel)}
                    for fuel in NESO_GENERATION_FUELS
                ],
            }
        )
    half_hours.sort(key=lambda item: item["datetime"])
    for previous, current in zip(half_hours, half_hours[1:]):
        current_at = datetime.strptime(current["datetime"], "%Y-%m-%dT%H:%M:%S").replace(
            tzinfo=timezone.utc
        )
        previous_at = datetime.strptime(previous["datetime"], "%Y-%m-%dT%H:%M:%S").replace(
            tzinfo=timezone.utc
        )
        gap = current_at - previous_at
        if gap != timedelta(minutes=30):
            raise UkSourceParseError(source, "the readings jump by more than half an hour")
    count = len(half_hours)
    total_megawatts = sum(item["totalMegawatts"] for item in half_hours)
    low_carbon = sum(item["lowCarbonMegawatts"] for item in half_hours)
    fuel_shares: list[dict[str, Any]] = []
    for fuel in NESO_GENERATION_FUELS:
        megawatts = sum(
            next(reading for reading in item["fuels"] if reading["fuel"] == fuel)["megawatts"]
            for item in half_hours
        )
        peak = max(
            next(reading for reading in item["fuels"] if reading["fuel"] == fuel)["megawatts"]
            for item in half_hours
        )
        fuel_shares.append(
            {
                "fuel": fuel,
                "averageMegawatts": _round_half_up(megawatts / count),
                "peakMegawatts": peak,
                "sharePercent": _round_half_up((megawatts / total_megawatts) * 1000) / 10,
            }
        )
    fuel_shares.sort(key=lambda item: -item["averageMegawatts"])
    cleanest = min(half_hours, key=lambda item: item["carbonIntensity"])
    dirtiest = max(half_hours, key=lambda item: item["carbonIntensity"])
    return {
        "halfHourCount": count,
        "firstHalfHourAt": half_hours[0]["datetime"],
        "lastHalfHourAt": half_hours[-1]["datetime"],
        "averageTotalMegawatts": _round_half_up(total_megawatts / count),
        "averageCarbonIntensity": _round_half_up(
            sum(item["carbonIntensity"] for item in half_hours) / count
        ),
        "lowCarbonSharePercent": _round_half_up((low_carbon / total_megawatts) * 1000) / 10,
        "fuelShares": fuel_shares,
        "cleanestHalfHour": cleanest,
        "dirtiestHalfHour": dirtiest,
        "halfHours": half_hours,
    }


def fetch_neso_generation_mix_window(
    half_hours: int = 336, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Reads the most recent half hours of Great Britain's generation mix."""
    return parse_neso_generation_mix(
        _fetch_json(
            "neso-generation-mix", build_neso_generation_mix_url(half_hours), fetch_impl=fetch_impl
        )
    )


# --- Data.gov.uk CKAN -----------------------------------------------------

DATA_GOV_UK_PACKAGE_SEARCH_URL = "https://www.data.gov.uk/api/3/action/package_search"


def parse_data_gov_uk_packages(payload: Any) -> dict[str, Any]:
    """Parses a Data.gov.uk package search payload."""
    source = "data-gov-uk-ckan"
    data = _need_dict(source, payload)
    if data.get("success") is not True:
        raise UkSourceParseError(source, "the catalogue reported a failure")
    result = _need_dict(source, data.get("result"))
    datasets: list[dict[str, Any]] = []
    for raw in _need_list(source, result.get("results"), "results"):
        row = _need_dict(source, raw)
        organization_value = row.get("organization")
        organization: dict[str, Any] = (
            organization_value if isinstance(organization_value, dict) else {}
        )
        tags_value = row.get("tags")
        tags: list[Any] = tags_value if isinstance(tags_value, list) else []
        datasets.append(
            {
                "name": _need_str(source, row.get("name"), "name"),
                "title": _need_str(source, row.get("title"), "title"),
                "publisher": _optional_text(organization.get("title")),
                "licenceId": _optional_text(row.get("license_id")),
                "licenceTitle": _optional_text(row.get("license_title")),
                "licenceUrl": _optional_text(row.get("license_url")),
                "resourceCount": _need_int(source, row.get("num_resources"), "num_resources"),
                "modifiedAt": row.get("metadata_modified"),
                "tags": [
                    _need_str(source, tag.get("name"), "tag.name")
                    for tag in tags
                    if isinstance(tag, dict)
                ],
            }
        )
    return {"totalCount": _need_int(source, result.get("count"), "count"), "datasets": datasets}


def fetch_data_gov_uk_packages(
    limit: int = 10, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Searches the Data.gov.uk catalogue for one page of datasets."""
    url = f"{DATA_GOV_UK_PACKAGE_SEARCH_URL}?rows={limit}"
    return parse_data_gov_uk_packages(_fetch_json("data-gov-uk-ckan", url, fetch_impl=fetch_impl))


# --- GOV.UK Content API ---------------------------------------------------

GOV_UK_CONTENT_API_BASE_URL = "https://www.gov.uk/api/content"
DEFAULT_GOV_UK_CONTENT_PATH = "/government/how-government-works"
_GOV_UK_WEB_BASE_URL = "https://www.gov.uk"


def _govuk_web_url(base_path: str) -> str:
    return f"{_GOV_UK_WEB_BASE_URL}/" if base_path == "/" else f"{_GOV_UK_WEB_BASE_URL}{base_path}"


def _nullable_text(source: str, value: Any, label: str) -> str | None:
    if value is None:
        return None
    return _need_str(source, value, label)


def _govuk_link(source: str, value: Any) -> dict[str, Any]:
    row = _need_dict(source, value)
    base_path = _need_str(source, row.get("base_path"), "base_path")
    web_url = _nullable_text(source, row.get("web_url"), "web_url")
    return {
        "title": _nullable_text(source, row.get("title"), "title"),
        "basePath": base_path,
        "webUrl": web_url if web_url is not None else _govuk_web_url(base_path),
    }


def _govuk_links(source: str, links: dict[str, Any], key: str) -> list[dict[str, Any]]:
    raw = links.get(key)
    if raw is None:
        return []
    return [_govuk_link(source, item) for item in _need_list(source, raw, key)]


def _normalise_content_path(content_path: str) -> str:
    trimmed = content_path.strip()
    if trimmed in ("", "/"):
        return "/"
    with_leading_slash = trimmed if trimmed.startswith("/") else f"/{trimmed}"
    return re.sub(r"/+$", "", with_leading_slash)


def build_gov_uk_content_url(content_path: str = DEFAULT_GOV_UK_CONTENT_PATH) -> str:
    """Builds a Content API URL for one piece of GOV.UK content."""
    normalised = _normalise_content_path(content_path)
    if normalised == "/":
        return GOV_UK_CONTENT_API_BASE_URL
    return f"{GOV_UK_CONTENT_API_BASE_URL}{quote(normalised, safe='/')}"


def parse_gov_uk_content(payload: Any) -> dict[str, Any]:
    """Parses one GOV.UK Content API payload into a flat content record."""
    source = "gov-uk-content"
    content = _need_dict(source, payload)
    links_value = content.get("links")
    links: dict[str, Any] = {} if links_value is None else _need_dict(source, links_value)
    organisations = _govuk_links(source, links, "organisations") + _govuk_links(
        source, links, "primary_publishing_organisation"
    )
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for link in organisations:
        if link["basePath"] in seen:
            continue
        seen.add(link["basePath"])
        deduped.append(link)
    withdrawn_value = content.get("withdrawn_notice")
    if withdrawn_value is not None and not isinstance(withdrawn_value, dict):
        raise UkSourceParseError(source, 'expected "withdrawn_notice" to be an object')
    translations = _govuk_links(source, links, "available_translations")
    base_path = _need_str(source, content.get("base_path"), "base_path")
    phase = content.get("phase")
    return {
        "contentId": _need_str(source, content.get("content_id"), "content_id"),
        "basePath": base_path,
        "webUrl": _govuk_web_url(base_path),
        "title": _nullable_text(source, content.get("title"), "title"),
        "description": _nullable_text(source, content.get("description"), "description"),
        "documentType": _need_str(source, content.get("document_type"), "document_type"),
        "schemaName": _need_str(source, content.get("schema_name"), "schema_name"),
        "locale": _need_str(source, content.get("locale"), "locale"),
        "phase": _nullable_text(source, phase, "phase"),
        "firstPublishedAt": _nullable_text(
            source, content.get("first_published_at"), "first_published_at"
        ),
        "publicUpdatedAt": _nullable_text(
            source, content.get("public_updated_at"), "public_updated_at"
        ),
        "updatedAt": _nullable_text(source, content.get("updated_at"), "updated_at"),
        "isWithdrawn": isinstance(withdrawn_value, dict) and len(withdrawn_value) > 0,
        "taxons": _govuk_links(source, links, "taxons"),
        "organisations": deduped,
        "availableTranslationCount": len(translations),
    }


def fetch_gov_uk_content(
    path: str = DEFAULT_GOV_UK_CONTENT_PATH, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Reads one content item from the GOV.UK Content API."""
    return parse_gov_uk_content(
        _fetch_json("gov-uk-content", build_gov_uk_content_url(path), fetch_impl=fetch_impl)
    )


# --- UK Parliament committees --------------------------------------------

UK_PARLIAMENT_ODATA_BASE_URL = "https://api.parliament.uk/odata"
UK_PARLIAMENT_COMMITTEE_ENTITY = "ParliamentaryCommittee"
DEFAULT_UK_PARLIAMENT_COMMITTEE_LIMIT = 20


def build_uk_parliament_committee_url(limit: int = 20, offset: int = 0) -> str:
    """Builds the OData URL for one page of parliamentary committees."""
    if limit <= 0:
        raise ValueError(f"limit must be a positive whole number, got {limit}")
    if offset < 0:
        raise ValueError(f"offset must be a whole number of zero or more, got {offset}")
    params = {"$top": str(limit), "$orderby": "FormalBodyName"}
    if offset > 0:
        params["$skip"] = str(offset)
    base = f"{UK_PARLIAMENT_ODATA_BASE_URL}/{UK_PARLIAMENT_COMMITTEE_ENTITY}"
    return f"{base}?{urlencode(params)}"


def parse_uk_parliament_committees(payload: Any) -> dict[str, Any]:
    """Parses one OData page of parliamentary committees."""
    source = "uk-parliament-committees"
    rows = _need_list(source, _need_dict(source, payload).get("value"), "value")
    seen: set[str] = set()
    committees: list[dict[str, Any]] = []
    for raw in rows:
        row = _need_dict(source, raw)
        local_id = _need_str(source, row.get("LocalId"), "LocalId")
        name = _need_str(source, row.get("FormalBodyName"), "FormalBodyName")
        if local_id in seen:
            raise UkSourceParseError(source, f"{name} is listed more than once ({local_id})")
        seen.add(local_id)
        end_date = _nullable_text(source, row.get("FormalBodyEndDate"), "FormalBodyEndDate")
        committees.append(
            {
                "localId": local_id,
                "name": name,
                "remit": _nullable_text(source, row.get("FormalBodyRemit"), "FormalBodyRemit"),
                "mnisId": _nullable_text(
                    source, row.get("FormalBodyMnisId"), "FormalBodyMnisId"
                ),
                "startDate": _nullable_text(
                    source, row.get("FormalBodyStartDate"), "FormalBodyStartDate"
                ),
                "endDate": end_date,
                "isCurrent": end_date is None,
            }
        )
    current_count = sum(1 for committee in committees if committee["isCurrent"])
    return {
        "committees": committees,
        "currentCount": current_count,
        "endedCount": len(committees) - current_count,
    }


def fetch_uk_parliament_committees(
    limit: int = DEFAULT_UK_PARLIAMENT_COMMITTEE_LIMIT,
    offset: int = 0,
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Reads one page of parliamentary committees from the Parliament OData service."""
    return parse_uk_parliament_committees(
        _fetch_json(
            "uk-parliament-committees",
            build_uk_parliament_committee_url(limit=limit, offset=offset),
            headers={"accept": "application/json"},
            fetch_impl=fetch_impl,
        )
    )


# --- Elexon system prices -------------------------------------------------

ELEXON_BMRS_API_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
ELEXON_SYSTEM_PRICES_PATH = "balancing/settlement/system-prices"
_SETTLEMENT_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def format_elexon_settlement_date(value: datetime) -> str:
    """Formats an instant as the UK settlement date the API takes."""
    return value.astimezone(ZoneInfo("Europe/London")).date().isoformat()


def previous_uk_settlement_date(value: datetime) -> str:
    """Returns the UK calendar date before the one that contains the instant."""
    return (value.astimezone(ZoneInfo("Europe/London")).date() - timedelta(days=1)).isoformat()


def build_elexon_system_prices_url(settlement_date: str) -> str:
    """Builds the system prices URL for one settlement day."""
    if not _SETTLEMENT_DATE_PATTERN.fullmatch(settlement_date):
        raise ValueError(f"settlementDate must be YYYY-MM-DD, got {settlement_date}")
    try:
        parsed = date.fromisoformat(settlement_date)
    except ValueError as exc:
        raise ValueError(f"settlementDate is not a real date: {settlement_date}") from exc
    if parsed.isoformat() != settlement_date:
        raise ValueError(f"settlementDate is not a real date: {settlement_date}")
    return f"{ELEXON_BMRS_API_BASE_URL}/{ELEXON_SYSTEM_PRICES_PATH}/{settlement_date}"


def parse_elexon_system_prices(payload: Any) -> dict[str, Any]:
    """Parses one settlement day of BMRS system prices."""
    source = "elexon-system-prices"
    data = _need_dict(source, payload)
    metadata = _need_dict(source, data.get("metadata"))
    datasets = _need_list(source, metadata.get("datasets"), "datasets")
    if not datasets:
        raise UkSourceParseError(source, "metadata carried no dataset id")
    dataset = _need_str(source, datasets[0], "datasets[0]")
    if dataset == "":
        raise UkSourceParseError(source, "metadata carried no dataset id")
    rows = _need_list(source, data.get("data"), "data")
    if not rows:
        raise UkSourceParseError(source, "the day carried no periods")
    first = _need_dict(source, rows[0])
    settlement_date = _need_str(source, first.get("settlementDate"), "settlementDate")
    if not _SETTLEMENT_DATE_PATTERN.fullmatch(settlement_date):
        raise UkSourceParseError(source, "expected a settlementDate as YYYY-MM-DD")
    seen_periods: set[int] = set()
    periods: list[dict[str, Any]] = []
    for raw in rows:
        row = _need_dict(source, raw)
        row_date = _need_str(source, row.get("settlementDate"), "settlementDate")
        if row_date != settlement_date:
            raise UkSourceParseError(
                source,
                f"the page carries more than one settlement date: {settlement_date} "
                f"and {row_date}",
            )
        period = _need_int(source, row.get("settlementPeriod"), "settlementPeriod")
        if period < 1 or period > 50:
            raise UkSourceParseError(source, "settlementPeriod must be from 1 to 50")
        if period in seen_periods:
            raise UkSourceParseError(source, f"settlement period {period} is listed more than once")
        seen_periods.add(period)
        periods.append(
            {
                "settlementPeriod": period,
                "startTime": _need_str(source, row.get("startTime"), "startTime"),
                "createdDateTime": _need_str(
                    source, row.get("createdDateTime"), "createdDateTime"
                ),
                "systemSellPrice": _need_number(
                    source, row.get("systemSellPrice"), "systemSellPrice"
                ),
                "systemBuyPrice": _need_number(
                    source, row.get("systemBuyPrice"), "systemBuyPrice"
                ),
                "priceDerivationCode": _need_str(
                    source, row.get("priceDerivationCode"), "priceDerivationCode"
                ),
                "netImbalanceVolume": _need_number(
                    source, row.get("netImbalanceVolume"), "netImbalanceVolume"
                ),
                "totalAcceptedOfferVolume": _need_number(
                    source, row.get("totalAcceptedOfferVolume"), "totalAcceptedOfferVolume"
                ),
                "totalAcceptedBidVolume": _need_number(
                    source, row.get("totalAcceptedBidVolume"), "totalAcceptedBidVolume"
                ),
            }
        )
    return {"dataset": dataset, "settlementDate": settlement_date, "periods": periods}


def fetch_elexon_system_prices(
    settlement_date: str | None = None,
    now: datetime | None = None,
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Reads one settlement day of system prices from the BMRS API."""
    selected = settlement_date or previous_uk_settlement_date(now or datetime.now(timezone.utc))
    return parse_elexon_system_prices(
        _fetch_json(
            "elexon-system-prices",
            build_elexon_system_prices_url(selected),
            headers={"accept": "application/json"},
            fetch_impl=fetch_impl,
        )
    )


# --- UKRI Gateway to Research awards -------------------------------------

UKRI_GTR_API_BASE_URL = "https://gtr.ukri.org/api/v3"
UKRI_GTR_AWARDS_PATH = "awards"
DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE = 20
MAX_UKRI_GTR_AWARD_PAGE_SIZE = 100


def build_ukri_gtr_awards_url(
    query: str | None = None, page: int = 1, page_size: int = 20
) -> str:
    """Builds a GTR awards URL for one page of the newest awards."""
    if page < 1:
        raise ValueError(f"page must be a whole number of one or more, got {page}")
    if page_size < DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE or page_size > MAX_UKRI_GTR_AWARD_PAGE_SIZE:
        raise ValueError(
            f"pageSize must be a whole number from {DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE} "
            f"to {MAX_UKRI_GTR_AWARD_PAGE_SIZE}, got {page_size}"
        )
    params = {
        "page": str(page),
        "size": str(page_size),
        "sortfield": "startDate",
        "sortorder": "D",
    }
    query_text = (query or "").strip()
    if query_text != "":
        params["query"] = query_text
    return f"{UKRI_GTR_API_BASE_URL}/{UKRI_GTR_AWARDS_PATH}?{urlencode(params)}"


def _ukri_person(source: str, value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    person = _need_dict(source, value)
    return {
        "firstName": _nullable_text(source, person.get("firstName"), "firstName"),
        "surname": _nullable_text(source, person.get("surname"), "surname"),
        "preferredName": _nullable_text(
            source, person.get("preferredName"), "preferredName"
        ),
    }


def parse_ukri_gtr_awards(payload: Any) -> dict[str, Any]:
    """Parses one page of GTR awards."""
    source = "ukri-gtr-awards"
    data = _need_dict(source, payload)
    paging = _need_dict(source, data.get("paging"))
    common = _need_dict(source, data.get("common"))
    seen: set[str] = set()
    awards: list[dict[str, Any]] = []
    for raw in _need_list(source, data.get("awardList"), "awardList"):
        award = _need_dict(source, _need_dict(source, raw).get("awardListItem"))
        award_id = _need_str(source, award.get("id"), "id")
        if award_id in seen:
            raise UkSourceParseError(
                source,
                f"{award.get('projectTitle')} is listed more than once ({award_id})",
            )
        seen.add(award_id)
        total_grant_value = award.get("totalGrantValue")
        awards.append(
            {
                "id": award_id,
                "projectTitle": _need_str(source, award.get("projectTitle"), "projectTitle"),
                "projectStatus": _need_str(source, award.get("projectStatus"), "projectStatus"),
                "grantRefNumber": _need_str(
                    source, award.get("grantRefNumber"), "grantRefNumber"
                ),
                "grantCategory": _need_str(source, award.get("grantCategory"), "grantCategory"),
                "fundingOrgName": _need_str(
                    source, award.get("fundingOrgName"), "fundingOrgName"
                ),
                "fundingOrgLongName": _need_str(
                    source, award.get("fundingOrgLongName"), "fundingOrgLongName"
                ),
                "leadOrgId": _need_str(source, award.get("leadOrgId"), "leadOrgId"),
                "leadOrgName": _need_str(source, award.get("leadOrgName"), "leadOrgName"),
                "leadOrgRegion": _nullable_text(
                    source, award.get("leadOrgRegion"), "leadOrgRegion"
                ),
                "leadOrgRole": _need_str(source, award.get("leadOrgRole"), "leadOrgRole"),
                "startDate": _nullable_text(source, award.get("startDate"), "startDate"),
                "endDate": _nullable_text(source, award.get("endDate"), "endDate"),
                "totalGrantValue": (
                    None
                    if total_grant_value is None
                    else _need_number(source, total_grant_value, "totalGrantValue")
                ),
                "leadPersonId": _nullable_text(
                    source, award.get("leadPersonId"), "leadPersonId"
                ),
                "leadPersonName": _ukri_person(source, award.get("leadPersonName")),
                "projectPath": _need_str(source, award.get("uiPath"), "uiPath"),
                "apiUrl": _need_str(source, award.get("href"), "href"),
            }
        )
    page = _need_int(source, paging.get("page"), "page")
    size = _need_int(source, paging.get("size"), "size")
    if page < 1 or size < 1:
        raise UkSourceParseError(source, "paging must use positive whole numbers")
    total_size = _need_int(source, paging.get("totalSize"), "totalSize")
    total_pages = _need_int(source, paging.get("totalPages"), "totalPages")
    if total_size < 0 or total_pages < 0:
        raise UkSourceParseError(source, "paging totals must be zero or more")
    return {
        "page": page,
        "pageSize": size,
        "totalCount": total_size,
        "totalPages": total_pages,
        "lastDataRefreshDate": _need_str(
            source, common.get("lastDataRefreshDate"), "lastDataRefreshDate"
        ),
        "awards": awards,
    }


def fetch_ukri_gtr_awards(
    query: str | None = None,
    page: int = 1,
    page_size: int = DEFAULT_UKRI_GTR_AWARD_PAGE_SIZE,
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Reads one page of GTR awards, newest start date first."""
    return parse_ukri_gtr_awards(
        _fetch_json(
            "ukri-gtr-awards",
            build_ukri_gtr_awards_url(query=query, page=page, page_size=page_size),
            headers={"accept": "application/json"},
            fetch_impl=fetch_impl,
        )
    )


# --- legislation.gov.uk search -------------------------------------------

LEGISLATION_SEARCH_URL = "https://www.legislation.gov.uk/search/data.feed"
DEFAULT_LEGISLATION_QUERY = "environment"


def _legislation_language_text(markup: str, language: str) -> str | None:
    match = re.search(
        rf'<span\b[^>]*xml:lang="{language}"[^>]*>([\s\S]*?)</span>', markup, re.IGNORECASE
    )
    text = _strip_markup(match.group(1) if match else "")
    return text or None


def _legislation_canonical_url(entry: str) -> str | None:
    for match in re.finditer(r"<link\b([^>]*)\/?>", entry, re.IGNORECASE):
        attributes = match.group(1)
        if re.search(r"\brel=", attributes, re.IGNORECASE):
            continue
        href = re.search(r'(?:^|\s)href="([^"]*)"', attributes, re.IGNORECASE)
        if href:
            return href.group(1)
    return None


def _legislation_summary(entry: str) -> str | None:
    summary = _read_tag(entry, "summary")
    if summary is None:
        return None
    english = re.search(
        r'<p\b[^>]*xml:lang="en"[^>]*>([\s\S]*?)</p>', summary, re.IGNORECASE
    )
    text = _strip_markup(english.group(1) if english else summary)
    return text or None


def _legislation_subjects(entry: str) -> list[str]:
    values = re.findall(r'<ukm:Subject\b[^>]*\bValue="([^"]*)"', entry, re.IGNORECASE)
    seen: set[str] = set()
    subjects: list[str] = []
    for value in values:
        if value == "" or value in seen:
            continue
        seen.add(value)
        subjects.append(value)
    return subjects


def _legislation_titles(entry: str, index: int) -> tuple[str, str | None]:
    raw_title = _read_tag(entry, "title")
    if raw_title is None:
        raise UkSourceParseError(
            "legislation-search", f"search result {index + 1} has no title"
        )
    title_welsh = _legislation_language_text(raw_title, "cy")
    english = _legislation_language_text(raw_title, "en")
    title = english if english is not None else _strip_markup(raw_title)
    if title == "":
        raise UkSourceParseError(
            "legislation-search", f"search result {index + 1} has no title"
        )
    return title, title_welsh


def build_legislation_search_url(query: str | None = None, page: int = 1) -> str:
    """Builds a legislation.gov.uk search feed URL."""
    selected = (query or "").strip() or DEFAULT_LEGISLATION_QUERY
    if page < 1:
        raise ValueError(f"page must be a positive whole number, got {page}")
    params = {"text": selected}
    if page > 1:
        params["page"] = str(page)
    return f"{LEGISLATION_SEARCH_URL}?{urlencode(params)}"


def parse_legislation_search(payload: Any) -> dict[str, Any]:
    """Parses a legislation.gov.uk search feed."""
    source = "legislation-search"
    if not isinstance(payload, str):
        raise UkSourceParseError(source, "expected an Atom feed as text")
    if not re.search(r"<feed\b", payload, re.IGNORECASE):
        raise UkSourceParseError(source, "the response is not an Atom feed")
    query_match = re.search(r"<openSearch:Query\b[^>]*>", payload, re.IGNORECASE)
    query = (
        _read_attribute(query_match.group(0), "openSearch:Query", "searchTerms")
        if query_match
        else None
    ) or ""
    results: list[dict[str, Any]] = []
    for index, match in enumerate(
        re.finditer(r"<entry\b[^>]*>([\s\S]*?)</entry>", payload, re.IGNORECASE)
    ):
        entry = match.group(1)
        title, title_welsh = _legislation_titles(entry, index)
        entry_id = _strip_markup(_read_tag(entry, "id") or "")
        if entry_id == "":
            raise UkSourceParseError(source, f"search result {index + 1} has no id")
        year_text = _read_attribute(entry, "ukm:Year", "Value")
        number_text = _read_attribute(entry, "ukm:Number", "Value")
        updated = _read_tag(entry, "updated")
        published = _read_tag(entry, "published")
        results.append(
            {
                "id": entry_id,
                "title": title,
                "titleWelsh": title_welsh,
                "url": _legislation_canonical_url(entry),
                "type": _read_attribute(entry, "ukm:DocumentMainType", "Value"),
                "year": int(year_text, 10) if year_text is not None else None,
                "number": int(number_text, 10) if number_text is not None else None,
                "updatedAt": updated.strip() if updated is not None else None,
                "publishedAt": published.strip() if published is not None else None,
                "subjects": _legislation_subjects(entry),
                "summary": _legislation_summary(entry),
            }
        )
    return {
        "query": query,
        "page": _read_number_tag(payload, "leg:page") or 1,
        "itemsPerPage": _read_number_tag(payload, "openSearch:itemsPerPage") or 0,
        "morePages": _read_number_tag(payload, "leg:morePages") or 0,
        "results": results,
    }


def fetch_legislation_search(
    query: str | None = None, page: int = 1, fetch_impl: FetchText | None = None
) -> dict[str, Any]:
    """Reads one page of legislation.gov.uk search results."""
    text = get_text(
        "legislation-search",
        build_legislation_search_url(query=query, page=page),
        headers={"accept": "application/atom+xml"},
        fetch_impl=fetch_impl,
    )
    return parse_legislation_search(text)


# --- The Gazette notices --------------------------------------------------

GAZETTE_NOTICES_URL = "https://www.thegazette.co.uk/all-notices/notice/data.json"


def build_gazette_notices_url(
    query: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    page: int = 1,
) -> str:
    """Builds a Gazette notice feed URL."""
    if page < 1:
        raise ValueError(f"page must be a positive whole number, got {page}")
    params: dict[str, str] = {}
    query_text = (query or "").strip()
    if query_text != "":
        params["text"] = query_text
    start_text = (start_date or "").strip()
    if start_text != "":
        params["start-publish-date"] = start_text
    end_text = (end_date or "").strip()
    if end_text != "":
        params["end-publish-date"] = end_text
    if page > 1:
        params["results-page"] = str(page)
    return f"{GAZETTE_NOTICES_URL}?{urlencode(params)}" if params else GAZETTE_NOTICES_URL


def _gazette_count(source: str, value: Any, field: str) -> int:
    if isinstance(value, bool):
        raise UkSourceParseError(source, f"the feed wrote {value!r} for {field}")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value.strip(), 10)
        except ValueError as exc:
            raise UkSourceParseError(
                source, f"the feed wrote {value!r} for {field}"
            ) from exc
    if isinstance(value, float) and value.is_integer():
        return int(value)
    raise UkSourceParseError(source, f"the feed wrote {value!r} for {field}")


def _gazette_coordinate(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _gazette_notice_url(links: list[Any]) -> str | None:
    for raw in links:
        link = _need_dict("gazette-notices", raw)
        href = _need_str("gazette-notices", link.get("@href"), "@href")
        if "/id/" not in href and re.search(r"/notice/\d+$", href):
            return href
    return None


def parse_gazette_notices(payload: Any) -> dict[str, Any]:
    """Parses one page of the Gazette notice feed."""
    source = "gazette-notices"
    data = _need_dict(source, payload)
    total = _gazette_count(source, data.get("f:total"), "f:total")
    page = _gazette_count(source, data.get("f:page-number"), "f:page-number")
    page_size = _gazette_count(source, data.get("f:page-size"), "f:page-size")
    entries_value = data.get("entry")
    entries = [] if entries_value is None else _need_list(source, entries_value, "entry")
    notices: list[dict[str, Any]] = []
    for raw in entries:
        entry = _need_dict(source, raw)
        notice_id = _need_str(source, entry.get("id"), "id")
        title = _need_str(source, entry.get("title"), "title")
        if notice_id == "":
            raise UkSourceParseError(source, 'expected "id" to be text')
        if title == "":
            raise UkSourceParseError(source, 'expected "title" to be text')
        links = _need_list(source, entry.get("link"), "link")
        category_value = entry.get("category")
        if category_value is None:
            categories: list[str] = []
        else:
            category_entries = (
                category_value if isinstance(category_value, list) else [category_value]
            )
            categories = [
                _need_str(source, _need_dict(source, item).get("@term"), "@term")
                for item in category_entries
            ]
        point_value = entry.get("geo:Point")
        point = {} if point_value is None else _need_dict(source, point_value)
        notices.append(
            {
                "id": notice_id,
                "noticeCode": _nullable_text(source, entry.get("f:notice-code"), "f:notice-code"),
                "title": title,
                "publishedAt": _nullable_text(source, entry.get("published"), "published"),
                "updatedAt": _nullable_text(source, entry.get("updated"), "updated"),
                "url": _gazette_notice_url(links),
                "categories": categories,
                "latitude": _gazette_coordinate(point.get("geo:lat")),
                "longitude": _gazette_coordinate(point.get("geo:long")),
                "contentHtml": _nullable_text(source, entry.get("content"), "content"),
            }
        )
    return {"totalCount": total, "page": page, "pageSize": page_size, "notices": notices}


def fetch_gazette_notices(
    query: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    page: int = 1,
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Reads one page of Gazette notices."""
    return parse_gazette_notices(
        _fetch_json(
            "gazette-notices",
            build_gazette_notices_url(query, start_date, end_date, page),
            headers={"accept": "application/json"},
            fetch_impl=fetch_impl,
        )
    )


# --- ONS Open Geography Portal -------------------------------------------

ONS_GEOGRAPHY_SEARCH_URL = "https://geoportal.statistics.gov.uk/api/search/v1/collections/all/items"
DEFAULT_ONS_GEOGRAPHY_LIMIT = 20


def build_ons_geography_search_url(
    limit: int = DEFAULT_ONS_GEOGRAPHY_LIMIT,
    query: str | None = None,
    start_index: int = 0,
) -> str:
    """Builds an ONS geography search URL."""
    if limit < 1:
        raise ValueError(f"limit must be a positive whole number, got {limit}")
    if start_index < 0:
        raise ValueError(f"startIndex must be a whole number of zero or more, got {start_index}")
    params = {"limit": str(limit)}
    query_text = (query or "").strip()
    if query_text != "":
        params["q"] = query_text
    if start_index > 0:
        params["startindex"] = str(start_index)
    return f"{ONS_GEOGRAPHY_SEARCH_URL}?{urlencode(params)}"


def _ons_iso_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise UkSourceParseError("ons-geography", "expected an epoch millisecond number")
    try:
        moment = datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def _ons_next_start_index(links: Any) -> int | None:
    if links is None:
        return None
    for raw in _need_list("ons-geography", links, "links"):
        link = _need_dict("ons-geography", raw)
        rel = _need_str("ons-geography", link.get("rel"), "rel")
        href = _need_str("ons-geography", link.get("href"), "href")
        if rel != "next":
            continue
        values = parse_qs(urlparse(href).query).get("startindex", [])
        if not values:
            return None
        try:
            index = int(values[0], 10)
        except ValueError:
            return None
        return index if index >= 0 else None
    return None


def parse_ons_geography_datasets(payload: Any) -> dict[str, Any]:
    """Parses a page of ONS geography search results."""
    source = "ons-geography"
    data = _need_dict(source, payload)
    if data.get("type") != "FeatureCollection":
        raise UkSourceParseError(source, 'expected "type" to be FeatureCollection')
    datasets: list[dict[str, Any]] = []
    for raw in _need_list(source, data.get("features"), "features"):
        feature = _need_dict(source, raw)
        properties = _need_dict(source, feature.get("properties"))
        geometry_value = feature.get("geometry")
        geometry = None if geometry_value is None else _need_dict(source, geometry_value)
        tags_value = properties.get("tags")
        tags = (
            [_need_str(source, tag, "tags") for tag in _need_list(source, tags_value, "tags")]
            if tags_value is not None
            else []
        )
        datasets.append(
            {
                "id": _need_str(source, feature.get("id"), "id"),
                "title": _need_str(source, properties.get("title"), "title"),
                "type": _optional_text(properties.get("type")),
                "owner": _optional_text(properties.get("owner")),
                "url": _optional_text(properties.get("url")),
                "description": _optional_text(
                    _strip_markup(str(properties.get("description") or ""))
                ),
                "licence": _optional_text(properties.get("license")),
                "licenceInfo": _optional_text(
                    _strip_markup(str(properties.get("licenseInfo") or ""))
                ),
                "tags": [tag for tag in tags if tag != ""],
                "createdAt": _ons_iso_timestamp(properties.get("created")),
                "modifiedAt": _ons_iso_timestamp(properties.get("modified")),
                "geometryType": (
                    _need_str(source, geometry.get("type"), "geometry.type")
                    if geometry is not None
                    else None
                ),
            }
        )
    return {
        "totalCount": _need_int(source, data.get("numberMatched"), "numberMatched"),
        "returnedCount": _need_int(source, data.get("numberReturned"), "numberReturned"),
        "nextStartIndex": _ons_next_start_index(data.get("links")),
        "datasets": datasets,
    }


def fetch_ons_geography_datasets(
    limit: int = DEFAULT_ONS_GEOGRAPHY_LIMIT,
    query: str | None = None,
    start_index: int = 0,
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Reads one page of ONS geography datasets."""
    return parse_ons_geography_datasets(
        _fetch_json(
            "ons-geography",
            build_ons_geography_search_url(limit, query, start_index),
            headers={"accept": "application/geo+json"},
            fetch_impl=fetch_impl,
        )
    )


# --- NESO Data Portal catalogue -------------------------------------------

NESO_CATALOGUE_SEARCH_URL = "https://api.neso.energy/api/3/action/package_search"
DEFAULT_NESO_CATALOGUE_LIMIT = 20


def build_neso_catalogue_url(
    limit: int = DEFAULT_NESO_CATALOGUE_LIMIT,
    query: str | None = None,
    start: int = 0,
) -> str:
    """Builds a NESO catalogue search URL."""
    if limit < 1:
        raise ValueError(f"limit must be a positive whole number, got {limit}")
    if start < 0:
        raise ValueError(f"start must be a whole number of zero or more, got {start}")
    params = {"rows": str(limit)}
    query_text = (query or "").strip()
    if query_text != "":
        params["q"] = query_text
    if start > 0:
        params["start"] = str(start)
    return f"{NESO_CATALOGUE_SEARCH_URL}?{urlencode(params)}"


def parse_neso_catalogue(payload: Any) -> dict[str, Any]:
    """Parses one page of NESO catalogue datasets."""
    source = "neso-catalogue"
    data = _need_dict(source, payload)
    if data.get("success") is not True:
        raise UkSourceParseError(source, "the catalogue reported a failure")
    result = _need_dict(source, data.get("result"))
    datasets: list[dict[str, Any]] = []
    for raw in _need_list(source, result.get("results"), "results"):
        row = _need_dict(source, raw)
        organization_value = row.get("organization")
        organization = (
            {} if organization_value is None else _need_dict(source, organization_value)
        )
        tags_value = row.get("tags")
        tags = (
            [
                _need_str(source, _need_dict(source, tag).get("name"), "tag.name")
                for tag in _need_list(source, tags_value, "tags")
            ]
            if tags_value is not None
            else []
        )
        modified_value = row.get("metadata_modified")
        datasets.append(
            {
                "name": _need_str(source, row.get("name"), "name"),
                "title": _need_str(source, row.get("title"), "title"),
                "publisher": _optional_text(organization.get("title")),
                "licenceId": _optional_text(row.get("license_id")),
                "licenceTitle": _optional_text(row.get("license_title")),
                "licenceUrl": _optional_text(row.get("license_url")),
                "resourceCount": _need_int(source, row.get("num_resources"), "num_resources"),
                "modifiedAt": (
                    None
                    if modified_value is None
                    else _need_str(source, modified_value, "metadata_modified")
                ),
                "tags": tags,
            }
        )
    return {
        "totalCount": _need_int(source, result.get("count"), "count"),
        "datasets": datasets,
    }


def fetch_neso_catalogue(
    limit: int = DEFAULT_NESO_CATALOGUE_LIMIT,
    query: str | None = None,
    start: int = 0,
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Searches the NESO Data Portal catalogue."""
    return parse_neso_catalogue(
        _fetch_json(
            "neso-catalogue",
            build_neso_catalogue_url(limit, query, start),
            headers={"accept": "application/json"},
            fetch_impl=fetch_impl,
        )
    )


# --- BGS OpenGeoscience WMS ----------------------------------------------

BGS_WMS_SOURCE_ID = "bgs-opengeoscience-wms"
BGS_WMS_CAPABILITIES_URL = (
    "https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WMSServer"
    "?service=WMS&request=GetCapabilities"
)


def _bgs_bounds(payload: str) -> dict[str, float] | None:
    box = re.search(
        r"<EX_GeographicBoundingBox\b[^>]*>([\s\S]*?)</EX_GeographicBoundingBox>",
        payload,
        re.IGNORECASE,
    )
    if box is None:
        return None
    values: dict[str, float] = {}
    for name, tag in (
        ("west", "westBoundLongitude"),
        ("east", "eastBoundLongitude"),
        ("south", "southBoundLatitude"),
        ("north", "northBoundLatitude"),
    ):
        raw = _read_tag(box.group(1), tag)
        if raw is None:
            return None
        try:
            values[name] = float(raw)
        except ValueError:
            return None
    return values


def parse_bgs_wms_capabilities(payload: Any) -> dict[str, Any]:
    """Parses a WMS capabilities document."""
    source = BGS_WMS_SOURCE_ID
    if not isinstance(payload, str):
        raise UkSourceParseError(source, "expected a WMS capabilities document as text")
    if not re.search(r"<WMS_Capabilities\b", payload, re.IGNORECASE):
        raise UkSourceParseError(source, "the response is not a WMS capabilities document")
    version_match = re.search(
        r'<WMS_Capabilities\b[^>]*\bversion="([^"]+)"', payload, re.IGNORECASE
    )
    version = version_match.group(1) if version_match else ""
    if version.strip() == "":
        raise UkSourceParseError(source, "the document has no WMS version")
    service = _read_tag(payload, "Service") or ""
    title = _strip_markup(_read_tag(service, "Title") or "")
    if title == "":
        raise UkSourceParseError(source, "the document has no service title")
    abstract = _strip_markup(_read_tag(service, "Abstract") or "")
    layers: list[dict[str, Any]] = []
    for match in re.finditer(
        r"<Layer\b([^>]*)>([\s\S]*?)(?=<Layer\b|</Layer>)", payload, re.IGNORECASE
    ):
        attributes, block = match.group(1), match.group(2)
        name = _strip_markup(_read_tag(block, "Name") or "")
        if name == "":
            continue
        layer_title = _strip_markup(_read_tag(block, "Title") or "")
        if layer_title == "":
            raise UkSourceParseError(source, f'layer "{name}" has no title')
        crs = [
            _strip_markup(raw)
            for raw in re.findall(r"<CRS\b[^>]*>([\s\S]*?)</CRS>", block, re.IGNORECASE)
        ]
        layers.append(
            {
                "name": name,
                "title": layer_title,
                "queryable": bool(re.search(r'\bqueryable="1"', attributes, re.IGNORECASE)),
                "crs": crs,
            }
        )
    if not layers:
        raise UkSourceParseError(source, "the document has no named layer")
    return {
        "version": version,
        "title": title,
        "abstract": abstract or None,
        "layers": layers,
        "geographicBounds": _bgs_bounds(payload),
    }


def fetch_bgs_wms_capabilities(fetch_impl: FetchText | None = None) -> dict[str, Any]:
    """Reads the BGS OpenGeoscience WMS capabilities document."""
    return parse_bgs_wms_capabilities(
        get_text(
            BGS_WMS_SOURCE_ID,
            BGS_WMS_CAPABILITIES_URL,
            headers={"accept": "text/xml"},
            fetch_impl=fetch_impl,
        )
    )


# --- HM Land Registry Price Paid Data ------------------------------------

LAND_REGISTRY_PRICE_PAID_URL = (
    "https://landregistry.data.gov.uk/data/ppi/transaction-record.json"
)
DEFAULT_LAND_REGISTRY_POSTCODE = "M1 1AE"
DEFAULT_LAND_REGISTRY_PAGE_SIZE = 20
_LAND_POSTCODE_PATTERN = re.compile(r"^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$")
_LAND_ISO_DATE_PATTERN = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_LAND_TRANSACTION_DATE_PATTERN = re.compile(
    r"^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$"
)
_LAND_MONTHS = {
    "jan": 0,
    "feb": 1,
    "mar": 2,
    "apr": 3,
    "may": 4,
    "jun": 5,
    "jul": 6,
    "aug": 7,
    "sep": 8,
    "oct": 9,
    "nov": 10,
    "dec": 11,
}
_LAND_PROPERTY_TYPES = {
    "detached": "detached",
    "semi-detached": "semi-detached",
    "terraced": "terraced",
    "flat-maisonette": "flat-maisonette",
    "other": "otherPropertyType",
}


def _land_assert_iso_date(value: str, field: str) -> None:
    match = _LAND_ISO_DATE_PATTERN.fullmatch(value)
    if match is None:
        raise ValueError(f"{field} must be a date written as YYYY-MM-DD, got {value}")
    try:
        parsed = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError as exc:
        raise ValueError(f"{field} is not a real calendar date, got {value}") from exc
    if parsed.isoformat() != value:
        raise ValueError(f"{field} is not a real calendar date, got {value}")


def _land_transaction_date(value: Any) -> str:
    if not isinstance(value, str):
        raise UkSourceParseError(
            "hm-land-registry-price-paid", f"the record wrote {value!r} for transactionDate"
        )
    match = _LAND_TRANSACTION_DATE_PATTERN.fullmatch(value.strip())
    month = _LAND_MONTHS.get((match.group(2) if match else "").lower())
    if match is None or month is None:
        raise UkSourceParseError(
            "hm-land-registry-price-paid", f"the record wrote {value!r} for transactionDate"
        )
    day, year = int(match.group(1)), int(match.group(3))
    try:
        parsed = date(year, month + 1, day)
    except ValueError as exc:
        raise UkSourceParseError(
            "hm-land-registry-price-paid", f"the record wrote {value!r} for transactionDate"
        ) from exc
    return parsed.isoformat()


def normalize_land_registry_postcode(postcode: str) -> str:
    """Puts a UK postcode into the single-space form the linked data API matches."""
    cleaned = re.sub(r"\s+", "", postcode.strip().upper())
    if not _LAND_POSTCODE_PATTERN.fullmatch(cleaned):
        raise ValueError(f"postcode is not a full UK postcode, got {postcode}")
    return f"{cleaned[:-3]} {cleaned[-3:]}"


def build_land_registry_price_paid_url(
    postcode: str = DEFAULT_LAND_REGISTRY_POSTCODE,
    property_type: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = DEFAULT_LAND_REGISTRY_PAGE_SIZE,
    page: int = 1,
    order: str = "newest",
) -> str:
    """Builds a Price Paid transaction query URL."""
    if limit < 1:
        raise ValueError(f"limit must be a positive whole number, got {limit}")
    if page < 1:
        raise ValueError(f"page must be a positive whole number, got {page}")
    if property_type is not None and property_type not in _LAND_PROPERTY_TYPES:
        names = ", ".join(_LAND_PROPERTY_TYPES)
        raise ValueError(f"propertyType must be one of {names}, got {property_type}")
    if from_date is not None:
        _land_assert_iso_date(from_date, "fromDate")
    if to_date is not None:
        _land_assert_iso_date(to_date, "toDate")
    params = [
        ("_pageSize", str(limit)),
        ("_sort", "transactionDate" if order == "oldest" else "-transactionDate"),
    ]
    if page > 1:
        params.append(("_page", str(page - 1)))
    params.append(("propertyAddress.postcode", normalize_land_registry_postcode(postcode)))
    if property_type is not None:
        params.append(
            (
                "propertyType",
                f"http://landregistry.data.gov.uk/def/common/{_LAND_PROPERTY_TYPES[property_type]}",
            )
        )
    if from_date is not None:
        params.append(("min-transactionDate", from_date))
    if to_date is not None:
        params.append(("max-transactionDate", to_date))
    return f"{LAND_REGISTRY_PRICE_PAID_URL}?{urlencode(params)}"


def _land_read_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        if any(not isinstance(part, str) for part in value):
            raise UkSourceParseError("hm-land-registry-price-paid", "expected text")
        text = " / ".join(value).strip()
    elif isinstance(value, str):
        text = value.strip()
    else:
        raise UkSourceParseError("hm-land-registry-price-paid", "expected text")
    return text or None


def _land_read_label(resource: Any, key: str) -> str | None:
    if resource is None:
        return None
    row = _need_dict("hm-land-registry-price-paid", resource)
    value = row.get(key)
    if value is None:
        return None
    if isinstance(value, str):
        return _land_read_text(value)
    entries = value if isinstance(value, list) else [value]
    labels: list[str] = []
    for raw in entries:
        entry = _need_dict("hm-land-registry-price-paid", raw)
        label = _need_str("hm-land-registry-price-paid", entry.get("_value"), "_value").strip()
        if label != "":
            labels.append(label)
    return " / ".join(labels) or None


def parse_land_registry_price_paid(payload: Any) -> dict[str, Any]:
    """Parses a page of Price Paid transaction records."""
    source = "hm-land-registry-price-paid"
    data = _need_dict(source, payload)
    result = _need_dict(source, data.get("result"))
    items_value = result.get("items")
    items = [] if items_value is None else _need_list(source, items_value, "items")
    transactions: list[dict[str, Any]] = []
    for raw in items:
        item = _need_dict(source, raw)
        price = _need_number(source, item.get("pricePaid"), "pricePaid")
        if price < 0:
            raise UkSourceParseError(source, "pricePaid must be zero or more")
        new_build_value = item.get("newBuild")
        if new_build_value is not None and not isinstance(new_build_value, bool):
            raise UkSourceParseError(source, 'expected "newBuild" to be true or false')
        address_value = item.get("propertyAddress")
        address = {} if address_value is None else _need_dict(source, address_value)
        property_type = item.get("propertyType")
        estate_type = item.get("estateType")
        record_status = item.get("recordStatus")
        transaction_category = item.get("transactionCategory")
        transactions.append(
            {
                "id": _need_str(source, item.get("transactionId"), "transactionId"),
                "recordUrl": _nullable_text(source, item.get("_about"), "_about"),
                "transactionDate": _land_transaction_date(item.get("transactionDate")),
                "pricePaid": price,
                "propertyType": _land_read_label(property_type, "prefLabel")
                or _land_read_label(property_type, "label"),
                "estateType": _land_read_label(estate_type, "prefLabel")
                or _land_read_label(estate_type, "label"),
                "newBuild": new_build_value,
                "recordStatus": _land_read_label(record_status, "prefLabel")
                or _land_read_label(record_status, "label"),
                "transactionCategory": _land_read_label(transaction_category, "prefLabel")
                or _land_read_label(transaction_category, "label"),
                "address": {
                    "paon": _land_read_text(address.get("paon")),
                    "saon": _land_read_text(address.get("saon")),
                    "street": _land_read_text(address.get("street")),
                    "locality": _land_read_text(address.get("locality")),
                    "town": _land_read_text(address.get("town")),
                    "district": _land_read_text(address.get("district")),
                    "county": _land_read_text(address.get("county")),
                    "postcode": _land_read_text(address.get("postcode")),
                },
            }
        )
    page_value = result.get("page")
    items_per_page_value = result.get("itemsPerPage")
    next_page_url = _nullable_text(source, result.get("next"), "next")
    return {
        "page": (_need_int(source, page_value, "page") if page_value is not None else 0) + 1,
        "itemsPerPage": (
            _need_int(source, items_per_page_value, "itemsPerPage")
            if items_per_page_value is not None
            else len(transactions)
        ),
        "hasNextPage": next_page_url is not None,
        "nextPageUrl": next_page_url,
        "transactions": transactions,
    }


def fetch_land_registry_price_paid_transactions(
    postcode: str = DEFAULT_LAND_REGISTRY_POSTCODE,
    property_type: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = DEFAULT_LAND_REGISTRY_PAGE_SIZE,
    page: int = 1,
    order: str = "newest",
    fetch_impl: FetchText | None = None,
) -> dict[str, Any]:
    """Reads one page of Price Paid transaction records."""
    return parse_land_registry_price_paid(
        _fetch_json(
            "hm-land-registry-price-paid",
            build_land_registry_price_paid_url(
                postcode=postcode,
                property_type=property_type,
                from_date=from_date,
                to_date=to_date,
                limit=limit,
                page=page,
                order=order,
            ),
            headers={"accept": "application/json"},
            fetch_impl=fetch_impl,
        )
    )


# --- Registry -------------------------------------------------------------

UK_DATA_SOURCES: list[UkDataAdapter] = [
    UkDataAdapter(
        "flood-stations",
        "Environment Agency flood-monitoring stations",
        "none",
        "Monitoring stations with their river, catchment, and published measures.",
        lambda fetch_impl=None: fetch_flood_stations(fetch_impl=fetch_impl),
        parse_flood_stations,
        lambda: parse_flood_stations(read_fixture_json("flood-stations.json")),
    ),
    UkDataAdapter(
        "flood-readings",
        "Environment Agency flood-monitoring readings",
        "none",
        "Recent water level readings for one station, newest first.",
        lambda fetch_impl=None: fetch_flood_station_readings(fetch_impl=fetch_impl),
        parse_flood_readings,
        lambda: parse_flood_readings(read_fixture_json("flood-station-readings.json")),
    ),
    UkDataAdapter(
        "ons-datasets",
        "Office for National Statistics dataset catalogue",
        "none",
        "Every dataset the ONS beta API lists, with its state and last-updated stamp.",
        lambda fetch_impl=None: fetch_ons_datasets(fetch_impl=fetch_impl),
        parse_ons_datasets,
        lambda: parse_ons_datasets(read_fixture_json("ons-datasets.json")),
    ),
    UkDataAdapter(
        "food-hygiene-authorities",
        "Food Standards Agency food hygiene registers",
        "none",
        "Every local authority food hygiene register, with its establishment count.",
        lambda fetch_impl=None: fetch_food_hygiene_authorities(fetch_impl=fetch_impl),
        parse_food_hygiene_authorities,
        lambda: parse_food_hygiene_authorities(read_fixture_json("food-hygiene-authorities.json")),
    ),
    UkDataAdapter(
        "tfl-bike-points",
        "Transport for London Santander Cycles docking stations",
        "none",
        "Every Santander Cycles docking station, with its docking points and docked bikes.",
        lambda fetch_impl=None: fetch_tfl_bike_points(fetch_impl=fetch_impl),
        parse_tfl_bike_points,
        lambda: parse_tfl_bike_points(read_fixture_json("tfl-bike-points.json")),
    ),
    UkDataAdapter(
        "planning-datasets",
        "Ministry of Housing, Communities and Local Government planning datasets",
        "none",
        "Every dataset the Planning Data platform lists, with the records behind it.",
        lambda fetch_impl=None: fetch_planning_datasets(fetch_impl=fetch_impl),
        parse_planning_datasets,
        lambda: parse_planning_datasets(read_fixture_json("planning-datasets.json")),
    ),
    UkDataAdapter(
        "ancient-woodland",
        "Natural England ancient woodland (England)",
        "none",
        "Ancient woodland polygons for England, counted by woodland type and by size.",
        lambda fetch_impl=None: fetch_ancient_woodland_profile(fetch_impl=fetch_impl),
        parse_ancient_woodland_profile,
        lambda: parse_ancient_woodland_profile(read_fixture_json("ancient-woodland.json")),
    ),
    UkDataAdapter(
        "bank-rate",
        "Bank of England Bank Rate",
        "none",
        "The daily official Bank Rate, from 2 January 1975 to the latest published day.",
        lambda fetch_impl=None: fetch_bank_rate_observations(fetch_impl=fetch_impl),
        parse_bank_rate_csv,
        lambda: parse_bank_rate_csv(read_fixture_text("bank-rate.csv")),
    ),
    UkDataAdapter(
        "police-crimes",
        "Home Office police.uk recorded crime",
        "none",
        "Street-level crime recorded within a mile of a point, counted by type and outcome.",
        lambda fetch_impl=None: fetch_police_crime_summary(fetch_impl=fetch_impl),
        parse_police_crime_summary,
        lambda: parse_police_crime_summary(read_fixture_json("police-crimes.json")),
    ),
    UkDataAdapter(
        "carbon-intensity",
        "National Energy System Operator carbon intensity",
        "none",
        "Half-hourly carbon intensity for Great Britain, with the cleanest and dirtiest "
        "half hours.",
        lambda fetch_impl=None: fetch_carbon_intensity_window(fetch_impl=fetch_impl),
        parse_carbon_intensity_window,
        lambda: parse_carbon_intensity_window(read_fixture_json("carbon-intensity.json")),
    ),
    UkDataAdapter(
        "parliament-seats",
        "UK Parliament state of the parties",
        "none",
        "Seats each party holds in the House of Commons, with the members counted behind them.",
        lambda fetch_impl=None: fetch_parliament_seats(fetch_impl=fetch_impl),
        parse_parliament_seats,
        lambda: parse_parliament_seats(read_fixture_json("parliament-seats.json")),
    ),
    UkDataAdapter(
        "postcode-lookup",
        "postcodes.io postcode lookup",
        "none",
        "One postcode's country, region, wards, and coordinates.",
        lambda fetch_impl=None: fetch_postcode_lookup(fetch_impl=fetch_impl),
        parse_postcode_lookup,
        lambda: parse_postcode_lookup(read_fixture_json("postcode-lookup-2026-10-05.json")),
    ),
    UkDataAdapter(
        "explore-education-statistics",
        "Department for Education Explore Education Statistics publications",
        "none",
        "The most recent statistics releases the Department for Education has published.",
        lambda fetch_impl=None: fetch_explore_education_publications(fetch_impl=fetch_impl),
        parse_explore_education_publications,
        lambda: parse_explore_education_publications(
            read_fixture_json("explore-education-statistics-2026-10-05.json")
        ),
    ),
    UkDataAdapter(
        "london-datastore",
        "London Datastore dataset catalogue",
        "none",
        "Every dataset the Greater London Authority lists on the London Datastore.",
        lambda fetch_impl=None: fetch_london_datastore_packages(fetch_impl=fetch_impl),
        parse_london_datastore_packages,
        lambda: parse_london_datastore_packages(
            read_fixture_json("london-datastore-2026-10-05.json")
        ),
    ),
    UkDataAdapter(
        "tna-discovery",
        "The National Archives Discovery catalogue search",
        "none",
        'Catalogue records matching "test", with the total hit count.',
        lambda fetch_impl=None: fetch_tna_discovery_records(fetch_impl=fetch_impl),
        parse_tna_discovery_records,
        lambda: parse_tna_discovery_records(read_fixture_json("tna-discovery-2026-10-05.json")),
    ),
    UkDataAdapter(
        "ukhsa-dashboard",
        "UK Health Security Agency data dashboard",
        "none",
        "New HIV diagnoses in England, as annual counts from the UKHSA dashboard.",
        lambda fetch_impl=None: fetch_ukhsa_metric_points(fetch_impl=fetch_impl),
        parse_ukhsa_metric_points,
        lambda: parse_ukhsa_metric_points(read_fixture_json("ukhsa-dashboard-2026-10-05.json")),
    ),
    UkDataAdapter(
        "nomis",
        "Nomis SDMX dataset catalogue",
        "none",
        "Every dataset definition the ONS Nomis catalogue publishes, with its status.",
        lambda fetch_impl=None: fetch_nomis_dataset_definitions(fetch_impl=fetch_impl),
        parse_nomis_dataset_definitions,
        lambda: parse_nomis_dataset_definitions(read_fixture_json("nomis-2026-10-05.json")),
    ),
    UkDataAdapter(
        "fingertips-indicators",
        "Office for Health Improvement and Disparities Fingertips indicators",
        "none",
        "Metadata for the public health indicators Fingertips publishes, with their sources.",
        lambda fetch_impl=None: fetch_fingertips_indicators(fetch_impl=fetch_impl),
        parse_fingertips_indicators,
        lambda: parse_fingertips_indicators(
            read_fixture_json("fingertips-indicators-2026-10-05.json")
        ),
    ),
    UkDataAdapter(
        "find-a-tender",
        "Find a Tender OCDS release packages",
        "none",
        "The most recent public procurement notices Find a Tender publishes.",
        lambda fetch_impl=None: fetch_find_a_tender_releases(fetch_impl=fetch_impl),
        parse_find_a_tender_releases,
        lambda: parse_find_a_tender_releases(read_fixture_json("find-a-tender-2026-10-05.json")),
    ),
    UkDataAdapter(
        "tfl-line-status",
        "Transport for London Tube line status",
        "none",
        "The live service status of every Tube line, with disruption reasons.",
        lambda fetch_impl=None: fetch_tfl_line_statuses(fetch_impl=fetch_impl),
        parse_tfl_line_statuses,
        lambda: parse_tfl_line_statuses(read_fixture_json("tfl-line-status-2026-10-05.json")),
    ),
    UkDataAdapter(
        "public-health-scotland",
        "Public Health Scotland open data catalogue",
        "none",
        "Every dataset Public Health Scotland publishes on its open data portal.",
        lambda fetch_impl=None: fetch_public_health_scotland_datasets(fetch_impl=fetch_impl),
        parse_public_health_scotland_datasets,
        lambda: parse_public_health_scotland_datasets(
            read_fixture_json("public-health-scotland-2026-10-05.json")
        ),
    ),
    UkDataAdapter(
        "nhsbsa-ckan",
        "NHS Business Services Authority open data catalogue",
        "none",
        "Every dataset the NHS Business Services Authority publishes on its CKAN portal.",
        lambda fetch_impl=None: fetch_nhsbsa_ckan_packages(fetch_impl=fetch_impl),
        parse_nhsbsa_ckan_packages,
        lambda: parse_nhsbsa_ckan_packages(read_fixture_json("nhsbsa-ckan-2026-10-05.json")),
    ),
    UkDataAdapter(
        "neso-generation-mix",
        "National Energy System Operator generation mix",
        "none",
        "Half-hourly Great Britain generation by fuel, with the cleanest and dirtiest half hours.",
        lambda fetch_impl=None: fetch_neso_generation_mix_window(fetch_impl=fetch_impl),
        parse_neso_generation_mix,
        lambda: parse_neso_generation_mix(read_fixture_json("neso-generation-mix-2026-10-18.json")),
    ),
    UkDataAdapter(
        "data-gov-uk-ckan",
        "Data.gov.uk CKAN catalogue",
        "none",
        "Search the UK government open data catalogue hosted on Data.gov.uk.",
        lambda fetch_impl=None: fetch_data_gov_uk_packages(fetch_impl=fetch_impl),
        parse_data_gov_uk_packages,
        lambda: parse_data_gov_uk_packages(read_fixture_json("data-gov-uk-ckan-2026-11-05.json")),
    ),
    UkDataAdapter(
        "gov-uk-content",
        "GOV.UK Content API",
        "none",
        "One GOV.UK page, with its taxons and publishing organisations.",
        lambda fetch_impl=None: fetch_gov_uk_content(fetch_impl=fetch_impl),
        parse_gov_uk_content,
        lambda: parse_gov_uk_content(read_fixture_json("gov-uk-content-2026-11-07.json")),
    ),
    UkDataAdapter(
        "uk-parliament-committees",
        "UK Parliament committees",
        "none",
        "Parliamentary committees, with their remit, start date, and end date.",
        lambda fetch_impl=None: fetch_uk_parliament_committees(fetch_impl=fetch_impl),
        parse_uk_parliament_committees,
        lambda: parse_uk_parliament_committees(
            read_fixture_json("uk-parliament-committees-2026-11-08.json")
        ),
    ),
    UkDataAdapter(
        "elexon-system-prices",
        "Elexon BMRS settlement system prices",
        "none",
        "Settlement system buy and sell prices for one Great Britain settlement day.",
        lambda fetch_impl=None: fetch_elexon_system_prices(fetch_impl=fetch_impl),
        parse_elexon_system_prices,
        lambda: parse_elexon_system_prices(
            read_fixture_json("elexon-system-prices-2026-11-08.json")
        ),
    ),
    UkDataAdapter(
        "ukri-gtr-awards",
        "UKRI Gateway to Research awards",
        "none",
        "UKRI-funded research awards, newest start date first, with their lead organisation.",
        lambda fetch_impl=None: fetch_ukri_gtr_awards(fetch_impl=fetch_impl),
        parse_ukri_gtr_awards,
        lambda: parse_ukri_gtr_awards(read_fixture_json("ukri-gtr-awards-2026-11-08.json")),
    ),
    UkDataAdapter(
        "legislation-search",
        "legislation.gov.uk search",
        "none",
        "Search the UK statute book for Acts, orders, and regulations.",
        lambda fetch_impl=None: fetch_legislation_search(fetch_impl=fetch_impl),
        parse_legislation_search,
        lambda: parse_legislation_search(
            read_fixture_text("legislation-search-2026-11-08.xml")
        ),
    ),
    UkDataAdapter(
        "gazette-notices",
        "The Gazette notices",
        "none",
        "The latest notices in the UK official public record, with their notice codes and dates.",
        lambda fetch_impl=None: fetch_gazette_notices(fetch_impl=fetch_impl),
        parse_gazette_notices,
        lambda: parse_gazette_notices(read_fixture_json("gazette-notices-2026-11-08.json")),
    ),
    UkDataAdapter(
        "ons-geography",
        "ONS Open Geography Portal",
        "none",
        "Boundary and geography datasets for UK statistics, with tags and download links.",
        lambda fetch_impl=None: fetch_ons_geography_datasets(fetch_impl=fetch_impl),
        parse_ons_geography_datasets,
        lambda: parse_ons_geography_datasets(
            read_fixture_json("ons-geography-2026-11-08.json")
        ),
    ),
    UkDataAdapter(
        "neso-catalogue",
        "NESO Data Portal catalogue",
        "none",
        "The National Energy System Operator open data catalogue, with licence and resource "
        "counts.",
        lambda fetch_impl=None: fetch_neso_catalogue(fetch_impl=fetch_impl),
        parse_neso_catalogue,
        lambda: parse_neso_catalogue(read_fixture_json("neso-catalogue-2026-11-08.json")),
    ),
    UkDataAdapter(
        "bgs-opengeoscience-wms",
        "BGS OpenGeoscience WMS",
        "none",
        "BGS 1:50,000 digital geology layers, with the service bounds and coordinate systems.",
        lambda fetch_impl=None: fetch_bgs_wms_capabilities(fetch_impl=fetch_impl),
        parse_bgs_wms_capabilities,
        lambda: parse_bgs_wms_capabilities(read_fixture_text("bgs-wms-2026-11-08.xml")),
    ),
    UkDataAdapter(
        "hm-land-registry-price-paid",
        "HM Land Registry Price Paid Data",
        "none",
        "Sold property prices for one UK postcode, with address, property type, and completion "
        "date.",
        lambda fetch_impl=None: fetch_land_registry_price_paid_transactions(
            fetch_impl=fetch_impl
        ),
        parse_land_registry_price_paid,
        lambda: parse_land_registry_price_paid(
            read_fixture_json("hm-land-registry-price-paid-2026-11-17.json")
        ),
    ),
]


def get_uk_data_source(source_id: str) -> UkDataAdapter | None:
    """Looks up a source adapter by id."""
    return next((source for source in UK_DATA_SOURCES if source.id == source_id), None)


def probe_uk_data_source(
    adapter: UkDataAdapter, fetch_impl: FetchText | None = None
) -> UkSourceProbe:
    """Probes one source with a live fetch and reports the outcome."""
    try:
        data = adapter.fetch_live(fetch_impl=fetch_impl)
        return UkSourceProbe(
            adapter.id,
            adapter.name,
            adapter.auth,
            True,
            "ok",
            json.dumps(data)[:120],
        )
    except (UkSourceError, ValueError, TypeError, KeyError, OSError) as exc:
        return UkSourceProbe(adapter.id, adapter.name, adapter.auth, False, str(exc))


def probe_all_uk_data_sources(
    fetch_impl: FetchText | None = None, ids: Sequence[str] | None = None
) -> list[UkSourceProbe]:
    """Probes every requested source, with optional per-source ids."""
    if ids is not None:
        known = {source.id for source in UK_DATA_SOURCES}
        unknown = sorted(set(ids) - known)
        if unknown:
            raise ValueError(f"Unknown UK source ids: {', '.join(unknown)}")
    wanted = None if ids is None else set(ids)
    return [
        probe_uk_data_source(source, fetch_impl)
        for source in UK_DATA_SOURCES
        if wanted is None or source.id in wanted
    ]
