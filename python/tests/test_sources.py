"""Offline tests for every adapter in the UK Python port."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest

from ukdata import UK_DATA_SOURCES, get_uk_data_source, probe_all_uk_data_sources
from ukdata.errors import UkSourceParseError

EXPECTED_IDS = [
    "flood-stations",
    "flood-readings",
    "ons-datasets",
    "food-hygiene-authorities",
    "tfl-bike-points",
    "planning-datasets",
    "ancient-woodland",
    "bank-rate",
    "police-crimes",
    "carbon-intensity",
    "parliament-seats",
    "postcode-lookup",
    "explore-education-statistics",
    "london-datastore",
    "tna-discovery",
    "ukhsa-dashboard",
    "nomis",
    "fingertips-indicators",
    "find-a-tender",
    "tfl-line-status",
    "public-health-scotland",
    "nhsbsa-ckan",
    "neso-generation-mix",
    "data-gov-uk-ckan",
    "gov-uk-content",
    "uk-parliament-committees",
    "elexon-system-prices",
    "ukri-gtr-awards",
    "legislation-search",
    "gazette-notices",
    "ons-geography",
    "neso-catalogue",
    "bgs-opengeoscience-wms",
    "hm-land-registry-price-paid",
]

FIXTURES = Path(__file__).resolve().parents[1] / "src" / "ukdata" / "fixtures"


def _json(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class FixtureFetcher:
    """Answers every live read with the matching committed fixture."""

    def __init__(self) -> None:
        self.urls: list[str] = []

    def __call__(self, url: str, _headers: dict[str, str]) -> str:
        self.urls.append(url)
        parsed = urlparse(url)
        host = parsed.hostname
        if host == "environment.data.gov.uk":
            name = (
                "flood-station-readings.json"
                if "/readings" in parsed.path
                else "flood-stations.json"
            )
            return json.dumps(_json(name))
        if host == "api.beta.ons.gov.uk":
            return json.dumps(_json("ons-datasets.json"))
        if host == "api.ratings.food.gov.uk":
            return json.dumps(_json("food-hygiene-authorities.json"))
        if host == "api.tfl.gov.uk":
            if parsed.path.startswith("/Line/"):
                return json.dumps(_json("tfl-line-status-2026-10-05.json"))
            return json.dumps(_json("tfl-bike-points.json"))
        if host == "www.planning.data.gov.uk":
            return json.dumps(_json("planning-datasets.json"))
        if host == "services.arcgis.com":
            return json.dumps(self._ancient(parsed.query))
        if host == "www.bankofengland.co.uk":
            return (FIXTURES / "bank-rate.csv").read_text(encoding="utf-8")
        if host == "data.police.uk":
            return json.dumps(self._police(parsed.path, parsed.query))
        if host == "api.carbonintensity.org.uk":
            return json.dumps(self._carbon(url))
        if host == "members-api.parliament.uk":
            return json.dumps(_json("parliament-seats.json"))
        if host == "api.postcodes.io":
            return json.dumps(_json("postcode-lookup-2026-10-05.json"))
        if host == "api.education.gov.uk":
            return json.dumps(_json("explore-education-statistics-2026-10-05.json"))
        if host == "data.london.gov.uk":
            return json.dumps(_json("london-datastore-2026-10-05.json"))
        if host == "discovery.nationalarchives.gov.uk":
            return json.dumps(_json("tna-discovery-2026-10-05.json"))
        if host == "api.ukhsa-dashboard.data.gov.uk":
            return json.dumps(_json("ukhsa-dashboard-2026-10-05.json"))
        if host == "www.nomisweb.co.uk":
            return json.dumps(_json("nomis-2026-10-05.json"))
        if host == "fingertips.phe.org.uk":
            return json.dumps(_json("fingertips-indicators-2026-10-05.json"))
        if host == "www.find-tender.service.gov.uk":
            return json.dumps(_json("find-a-tender-2026-10-05.json"))
        if host == "www.opendata.nhs.scot":
            return json.dumps(_json("public-health-scotland-2026-10-05.json"))
        if host == "opendata.nhsbsa.net":
            return json.dumps(_json("nhsbsa-ckan-2026-10-05.json"))
        if host == "api.neso.energy":
            if "/package_search" in parsed.path:
                return json.dumps(_json("neso-catalogue-2026-11-08.json"))
            return json.dumps(_json("neso-generation-mix-2026-10-18.json"))
        if host == "www.data.gov.uk":
            return json.dumps(_json("data-gov-uk-ckan-2026-11-05.json"))
        if host == "www.gov.uk":
            return json.dumps(_json("gov-uk-content-2026-11-07.json"))
        if host == "api.parliament.uk":
            return json.dumps(_json("uk-parliament-committees-2026-11-08.json"))
        if host == "data.elexon.co.uk":
            return json.dumps(_json("elexon-system-prices-2026-11-08.json"))
        if host == "gtr.ukri.org":
            return json.dumps(_json("ukri-gtr-awards-2026-11-08.json"))
        if host == "www.legislation.gov.uk":
            return (FIXTURES / "legislation-search-2026-11-08.xml").read_text(encoding="utf-8")
        if host == "www.thegazette.co.uk":
            return json.dumps(_json("gazette-notices-2026-11-08.json"))
        if host == "geoportal.statistics.gov.uk":
            return json.dumps(_json("ons-geography-2026-11-08.json"))
        if host == "map.bgs.ac.uk":
            return (FIXTURES / "bgs-wms-2026-11-08.xml").read_text(encoding="utf-8")
        if host == "landregistry.data.gov.uk":
            return json.dumps(_json("hm-land-registry-price-paid-2026-11-17.json"))
        raise AssertionError(f"unexpected URL {url}")

    @staticmethod
    def _ancient(query: str) -> Any:
        fixture = _json("ancient-woodland.json")
        params = parse_qs(query)
        where = params.get("where", ["1=1"])[0]
        if "groupByFieldsForStatistics" not in params:
            return fixture["totals"]
        if where == "1=1":
            return fixture["categoryTotals"]
        bands = [
            "AREA < 1",
            "AREA >= 1 AND AREA < 2",
            "AREA >= 2 AND AREA < 5",
            "AREA >= 5 AND AREA < 10",
            "AREA >= 10 AND AREA < 20",
            "AREA >= 20 AND AREA < 50",
            "AREA >= 50 AND AREA < 100",
            "AREA >= 100",
        ]
        return fixture["sizeBandCounts"][bands.index(where)]

    @staticmethod
    def _police(path: str, query: str) -> Any:
        fixture = _json("police-crimes.json")
        if path.endswith("/crime-categories"):
            return fixture["categories"]
        if path.endswith("/crimes-street-dates"):
            return [{"date": entry["month"]} for entry in fixture["months"]]
        month = parse_qs(query)["date"][0]
        return next(entry["records"] for entry in fixture["months"] if entry["month"] == month)

    @staticmethod
    def _carbon(url: str) -> Any:
        fixture = _json("carbon-intensity.json")
        parts = urlparse(url).path.strip("/").split("/")
        start = datetime.strptime(parts[1], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        fixture_start = datetime.strptime(fixture["data"][0]["from"], "%Y-%m-%dT%H:%MZ").replace(
            tzinfo=timezone.utc
        )
        shift = start - fixture_start
        shifted = []
        for entry in fixture["data"]:
            item = dict(entry)
            for key in ("from", "to"):
                instant = (
                    datetime.strptime(entry[key], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
                    + shift
                )
                item[key] = instant.strftime("%Y-%m-%dT%H:%MZ")
            shifted.append(item)
        return {"data": shifted}


def test_registry_matches_typescript_adapter_ids() -> None:
    assert [source.id for source in UK_DATA_SOURCES] == EXPECTED_IDS


def test_registry_lookup_and_metadata() -> None:
    assert get_uk_data_source("flood-readings").name.startswith("Environment Agency")
    assert get_uk_data_source("does-not-exist") is None
    for source in UK_DATA_SOURCES:
        assert source.name
        assert source.auth == "none"
        assert source.description


@pytest.mark.parametrize("source", UK_DATA_SOURCES, ids=lambda source: source.id)
def test_every_adapter_has_a_parser_fixture_and_fetcher(source: Any) -> None:
    assert source.load_fixture() is not None
    assert callable(source.parse)
    assert callable(source.fetch_live)
    with pytest.raises(UkSourceParseError):
        source.parse(None)


def test_port_field_names_match_typescript() -> None:
    first = {
        "flood-stations": next(iter(UK_DATA_SOURCES)).load_fixture()[0],
        "flood-readings": get_uk_data_source("flood-readings").load_fixture()[0],
        "ons-datasets": get_uk_data_source("ons-datasets").load_fixture()[0],
        "food-hygiene-authorities": get_uk_data_source("food-hygiene-authorities").load_fixture()[
            0
        ],
        "tfl-bike-points": get_uk_data_source("tfl-bike-points").load_fixture()[0],
        "planning-datasets": get_uk_data_source("planning-datasets").load_fixture()[0],
        "bank-rate": get_uk_data_source("bank-rate").load_fixture()[0],
        "parliament-seats": get_uk_data_source("parliament-seats").load_fixture()["seats"][0],
        "postcode-lookup": get_uk_data_source("postcode-lookup").load_fixture(),
        "london-datastore": get_uk_data_source("london-datastore").load_fixture()[0],
        "tna-discovery": get_uk_data_source("tna-discovery").load_fixture()["records"][0],
        "ukhsa-dashboard": get_uk_data_source("ukhsa-dashboard").load_fixture()["points"][0],
        "nomis": get_uk_data_source("nomis").load_fixture()[0],
        "fingertips-indicators": get_uk_data_source("fingertips-indicators").load_fixture()[0],
        "find-a-tender": get_uk_data_source("find-a-tender").load_fixture()["releases"][0],
        "tfl-line-status": get_uk_data_source("tfl-line-status").load_fixture()[0],
        "public-health-scotland": get_uk_data_source("public-health-scotland").load_fixture()[0],
        "nhsbsa-ckan": get_uk_data_source("nhsbsa-ckan").load_fixture()[0],
        "data-gov-uk-ckan": get_uk_data_source("data-gov-uk-ckan").load_fixture()["datasets"][0],
    }
    assert set(first["flood-stations"]) == {
        "id",
        "notation",
        "label",
        "riverName",
        "catchmentName",
        "latitude",
        "longitude",
        "measures",
    }
    assert set(first["flood-readings"]) == {"measureId", "dateTime", "value"}
    assert set(first["ons-datasets"]) == {
        "id",
        "title",
        "state",
        "lastUpdatedIso",
        "isNationalStatistic",
        "keywords",
        "topicPath",
    }
    assert set(first["food-hygiene-authorities"]) == {
        "localAuthorityId",
        "localAuthorityCode",
        "localAuthorityName",
        "establishmentCount",
        "scheme",
    }
    assert set(first["tfl-bike-points"]) == {
        "id",
        "name",
        "dockCount",
        "bikeCount",
        "electricBikeCount",
        "emptyDockCount",
        "temporary",
    }
    assert set(first["planning-datasets"]) == {
        "dataset",
        "name",
        "entityCount",
        "themes",
        "typology",
        "phase",
        "licence",
    }
    assert set(first["bank-rate"]) == {"date", "ratePercent"}
    assert set(first["parliament-seats"]) == {
        "party",
        "seatCount",
        "maleCount",
        "femaleCount",
        "nonBinaryCount",
        "unallocatedSeatCount",
    }
    assert set(first["postcode-lookup"]) == {
        "postcode",
        "country",
        "region",
        "adminDistrict",
        "adminWard",
        "parliamentaryConstituency",
        "latitude",
        "longitude",
        "nhsHa",
    }
    assert set(first["london-datastore"]) == {"name"}
    assert set(first["tna-discovery"]) == {
        "id",
        "reference",
        "title",
        "description",
        "coveringDates",
        "catalogueLevel",
        "department",
        "heldBy",
    }
    assert set(first["ukhsa-dashboard"]) == {
        "theme",
        "subTheme",
        "topic",
        "geographyType",
        "geography",
        "geographyCode",
        "metric",
        "metricGroup",
        "stratum",
        "sex",
        "age",
        "year",
        "month",
        "epiweek",
        "date",
        "metricValue",
        "inReportingDelayPeriod",
    }
    assert set(first["nomis"]) == {
        "id",
        "name",
        "agencyId",
        "version",
        "uri",
        "status",
        "keywords",
        "units",
        "lastUpdated",
    }
    assert set(first["fingertips-indicators"]) == {
        "indicatorId",
        "name",
        "dataSource",
        "unitLabel",
        "valueType",
        "yearType",
        "lastUploadedAt",
        "latestChangeTimestampOverride",
    }
    assert set(first["find-a-tender"]) == {
        "ocid",
        "id",
        "date",
        "tags",
        "tenderTitle",
        "tenderStatus",
        "procurementMethod",
        "buyerName",
        "tenderValueAmount",
    }
    assert set(first["tfl-line-status"]) == {
        "id",
        "name",
        "modeName",
        "statusSeverity",
        "statusSeverityDescription",
        "reason",
    }
    assert set(first["public-health-scotland"]) == {"name"}
    assert set(first["nhsbsa-ckan"]) == {"name"}
    assert set(first["data-gov-uk-ckan"]) == {
        "name",
        "title",
        "publisher",
        "licenceId",
        "resourceCount",
        "modifiedAt",
        "tags",
    }
    ancient = get_uk_data_source("ancient-woodland").load_fixture()
    assert set(ancient) == {
        "recordCount",
        "totalHectares",
        "largestRecordHectares",
        "averageRecordHectares",
        "categoryCounts",
        "categoryHectares",
        "sizeBands",
    }
    assert set(ancient["sizeBands"][0]) == {
        "label",
        "minHectares",
        "recordCount",
        "categoryCounts",
        "maxHectares",
    }
    police = get_uk_data_source("police-crimes").load_fixture()
    assert set(police) == {
        "monthCount",
        "recordCount",
        "firstMonth",
        "latestMonth",
        "categoryCounts",
        "outcomeCounts",
        "months",
        "busiestMonth",
        "quietestMonth",
        "topCategory",
        "topOutcome",
    }
    carbon = get_uk_data_source("carbon-intensity").load_fixture()
    assert set(carbon) == {
        "periodCount",
        "dayCount",
        "firstPeriodFrom",
        "lastPeriodTo",
        "averageIntensity",
        "lowestPeriod",
        "highestPeriod",
        "bandCounts",
        "periods",
    }
    assert set(carbon["periods"][0]) == {"from", "to", "intensity", "index"}
    neso = get_uk_data_source("neso-generation-mix").load_fixture()
    assert set(neso) == {
        "halfHourCount",
        "firstHalfHourAt",
        "lastHalfHourAt",
        "averageTotalMegawatts",
        "averageCarbonIntensity",
        "lowCarbonSharePercent",
        "fuelShares",
        "cleanestHalfHour",
        "dirtiestHalfHour",
        "halfHours",
    }
    assert set(neso["fuelShares"][0]) == {
        "fuel",
        "averageMegawatts",
        "peakMegawatts",
        "sharePercent",
    }
    assert set(get_uk_data_source("gov-uk-content").load_fixture()) == {
        "contentId",
        "basePath",
        "webUrl",
        "title",
        "description",
        "documentType",
        "schemaName",
        "locale",
        "phase",
        "firstPublishedAt",
        "publicUpdatedAt",
        "updatedAt",
        "isWithdrawn",
        "taxons",
        "organisations",
        "availableTranslationCount",
    }
    assert set(get_uk_data_source("uk-parliament-committees").load_fixture()["committees"][0]) == {
        "localId",
        "name",
        "remit",
        "mnisId",
        "startDate",
        "endDate",
        "isCurrent",
    }
    assert set(get_uk_data_source("elexon-system-prices").load_fixture()["periods"][0]) == {
        "settlementPeriod",
        "startTime",
        "createdDateTime",
        "systemSellPrice",
        "systemBuyPrice",
        "priceDerivationCode",
        "netImbalanceVolume",
        "totalAcceptedOfferVolume",
        "totalAcceptedBidVolume",
    }
    assert set(get_uk_data_source("ukri-gtr-awards").load_fixture()["awards"][0]) == {
        "id",
        "projectTitle",
        "projectStatus",
        "grantRefNumber",
        "grantCategory",
        "fundingOrgName",
        "fundingOrgLongName",
        "leadOrgId",
        "leadOrgName",
        "leadOrgRegion",
        "leadOrgRole",
        "startDate",
        "endDate",
        "totalGrantValue",
        "leadPersonId",
        "leadPersonName",
        "projectPath",
        "apiUrl",
    }
    assert set(get_uk_data_source("legislation-search").load_fixture()["results"][0]) == {
        "id",
        "title",
        "titleWelsh",
        "url",
        "type",
        "year",
        "number",
        "updatedAt",
        "publishedAt",
        "subjects",
        "summary",
    }
    assert set(get_uk_data_source("gazette-notices").load_fixture()["notices"][0]) == {
        "id",
        "noticeCode",
        "title",
        "publishedAt",
        "updatedAt",
        "url",
        "categories",
        "latitude",
        "longitude",
        "contentHtml",
    }
    assert set(get_uk_data_source("ons-geography").load_fixture()["datasets"][0]) == {
        "id",
        "title",
        "type",
        "owner",
        "url",
        "description",
        "licence",
        "licenceInfo",
        "tags",
        "createdAt",
        "modifiedAt",
        "geometryType",
    }
    assert set(get_uk_data_source("neso-catalogue").load_fixture()["datasets"][0]) == {
        "name",
        "title",
        "publisher",
        "licenceId",
        "licenceTitle",
        "licenceUrl",
        "resourceCount",
        "modifiedAt",
        "tags",
    }
    assert set(get_uk_data_source("bgs-opengeoscience-wms").load_fixture()["layers"][0]) == {
        "name",
        "title",
        "queryable",
        "crs",
    }
    land_registry = get_uk_data_source("hm-land-registry-price-paid").load_fixture()
    assert set(land_registry["transactions"][0]) == {
        "id",
        "recordUrl",
        "transactionDate",
        "pricePaid",
        "propertyType",
        "estateType",
        "newBuild",
        "recordStatus",
        "transactionCategory",
        "address",
    }


def test_fixture_values_match_typescript_snapshots() -> None:
    assert len(get_uk_data_source("flood-stations").load_fixture()) == 1
    assert len(get_uk_data_source("flood-readings").load_fixture()) == 5
    assert len(get_uk_data_source("ons-datasets").load_fixture()) == 5
    assert len(get_uk_data_source("food-hygiene-authorities").load_fixture()) == 363
    assert len(get_uk_data_source("tfl-bike-points").load_fixture()) == 6
    assert len(get_uk_data_source("planning-datasets").load_fixture()) == 6
    assert get_uk_data_source("ancient-woodland").load_fixture()["recordCount"] == 53_638
    assert len(get_uk_data_source("bank-rate").load_fixture()) == 13_077
    police = get_uk_data_source("police-crimes").load_fixture()
    assert police["monthCount"] == 1
    assert police["recordCount"] == 1_417
    assert get_uk_data_source("carbon-intensity").load_fixture()["periodCount"] == 1_440
    assert get_uk_data_source("parliament-seats").load_fixture()["seatCount"] == 650
    assert get_uk_data_source("postcode-lookup").load_fixture()["postcode"] == "SW1A 1AA"
    assert (
        len(get_uk_data_source("explore-education-statistics").load_fixture()["publications"]) == 20
    )
    assert len(get_uk_data_source("london-datastore").load_fixture()) == 1_305
    assert get_uk_data_source("tna-discovery").load_fixture()["totalCount"] == 140_410
    assert get_uk_data_source("ukhsa-dashboard").load_fixture()["totalCount"] == 35
    assert len(get_uk_data_source("nomis").load_fixture()) == 25
    assert len(get_uk_data_source("fingertips-indicators").load_fixture()) == 1
    assert len(get_uk_data_source("find-a-tender").load_fixture()["releases"]) == 10
    assert len(get_uk_data_source("tfl-line-status").load_fixture()) == 11
    assert len(get_uk_data_source("public-health-scotland").load_fixture()) == 105
    assert len(get_uk_data_source("nhsbsa-ckan").load_fixture()) == 2_172
    assert get_uk_data_source("neso-generation-mix").load_fixture()["halfHourCount"] == 336
    assert get_uk_data_source("data-gov-uk-ckan").load_fixture()["totalCount"] == 3_875
    assert get_uk_data_source("gov-uk-content").load_fixture()["title"] == "How government works"
    assert len(get_uk_data_source("uk-parliament-committees").load_fixture()["committees"]) == 20
    assert len(get_uk_data_source("elexon-system-prices").load_fixture()["periods"]) == 6
    assert len(get_uk_data_source("ukri-gtr-awards").load_fixture()["awards"]) == 3
    assert len(get_uk_data_source("legislation-search").load_fixture()["results"]) == 2
    assert len(get_uk_data_source("gazette-notices").load_fixture()["notices"]) == 3
    assert len(get_uk_data_source("ons-geography").load_fixture()["datasets"]) == 2
    assert len(get_uk_data_source("neso-catalogue").load_fixture()["datasets"]) == 1
    assert len(get_uk_data_source("bgs-opengeoscience-wms").load_fixture()["layers"]) == 6
    assert (
        len(get_uk_data_source("hm-land-registry-price-paid").load_fixture()["transactions"]) == 3
    )


def test_every_adapter_fetches_and_parses_offline() -> None:
    fetcher = FixtureFetcher()
    for source in UK_DATA_SOURCES:
        result = source.fetch_live(fetch_impl=fetcher)
        assert result is not None, source.id
    assert len(fetcher.urls) >= len(UK_DATA_SOURCES)


def test_probe_all_uses_registry_order_and_requests_matching_fixtures() -> None:
    fetcher = FixtureFetcher()
    probes = probe_all_uk_data_sources(fetch_impl=fetcher)
    assert [probe.id for probe in probes] == EXPECTED_IDS
    assert all(probe.ok for probe in probes)
