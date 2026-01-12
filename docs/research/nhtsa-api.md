# NHTSA API Research

## Summary

NHTSA provides multiple APIs and datasets for accessing vehicle complaint data. The primary source for our use case is the **ODI (Office of Defects Investigation) Complaints API**.

---

## API Endpoints

### Complaints API (Primary)

**Base URL**: `https://api.nhtsa.gov/complaints/`

**Main Endpoint**:
```
GET /complaintsByVehicle?make={MAKE}&model={MODEL}&modelYear={MODEL_YR}
```

**Example**:
```
https://api.nhtsa.gov/complaints/complaintsByVehicle?make=acura&model=rdx&modelYear=2012
```

**Legacy Endpoint** (still functional):
```
http://www.nhtsa.gov/webapi/api/Complaints/vehicle/modelyear/{YEAR}/make/{MAKE}/model/{MODEL}
```

### VIN Decoder API (Supplementary)

**Base URL**: `https://vpic.nhtsa.dot.gov/api/`

Useful for enriching complaint data with vehicle specifications.

**Endpoints**:
- `/vehicles/DecodeVin/{VIN}?format=json` - Decode single VIN
- `/vehicles/DecodeVINValuesBatch/` - Batch decode up to 50 VINs

### SODA API (Bulk Access)

The complaints dataset is also available via Socrata Open Data API at:
`https://data.transportation.gov/resource/jhit-z9cc.json`

This allows SQL-like queries using SoQL.

---

## Data Schema

### Complaints Data Fields (49 fields total)

| Field | Type | Description | Relevance to CaseRadar |
|-------|------|-------------|------------------------|
| **CMPLID** | CHAR(9) | Internal unique sequence number | Primary key |
| **ODINO** | CHAR(9) | Internal reference number | Can repeat for multi-component |
| **MFR_NAME** | CHAR(40) | Manufacturer name | **High** - pattern grouping |
| **MAKETXT** | CHAR(25) | Vehicle/equipment make | **High** - pattern grouping |
| **MODELTXT** | CHAR(256) | Vehicle/equipment model | **High** - pattern grouping |
| **YEARTXT** | CHAR(4) | Model year | **High** - pattern grouping |
| **CRASH** | CHAR(1) | Crash involvement (Y/N) | **Critical** - severity scoring |
| **FIRE** | CHAR(1) | Fire involvement (Y/N) | **Critical** - severity scoring |
| **INJURED** | NUMBER(2) | Injured count | **Critical** - severity scoring |
| **DEATHS** | NUMBER(2) | Fatality count | **Critical** - severity scoring |
| **COMPDESC** | CHAR(128) | Component description | **High** - pattern clustering |
| **CDESCR** | CHAR(2048) | Full complaint description | **Critical** - text embedding |
| **FAILDATE** | CHAR(8) | Incident date (YYYYMMDD) | **High** - trend detection |
| **DATEA** | CHAR(8) | Date added to file | **High** - new complaint tracking |
| **LDATE** | CHAR(8) | Complaint receipt date | Medium |
| **VIN** | CHAR(11) | Vehicle ID (partial) | Medium - VIN decoding |
| **MILES** | NUMBER(7) | Mileage at failure | Medium |
| **CITY** | CHAR(30) | Consumer city | Low |
| **STATE** | CHAR(2) | Consumer state | Medium - geographic patterns |
| **CMPL_TYPE** | CHAR(4) | Complaint source | Low |
| **PROD_TYPE** | CHAR(4) | Product type (V/T/E/C) | Medium - filtering |
| **MEDICAL_ATTN** | CHAR(1) | Medical attention needed | **High** - severity |
| **VEHICLES_TOWED_YN** | CHAR(1) | Vehicle towed | Medium |

### Product Type Codes
- **V** = Vehicle
- **T** = Tire
- **E** = Equipment
- **C** = Child Safety Seat

### Component Categories (from COMPDESC)
Examples:
- `FUEL SYSTEM, GASOLINE:STORAGE:TANK ASSEMBLY`
- `AIR BAGS:FRONTAL:DRIVER SIDE`
- `ELECTRICAL SYSTEM:IGNITION:MODULE`
- `STEERING:WHEEL AND HANDLE BAR`

---

## Rate Limits & Authentication

### Authentication
- **No API key required** for complaints API
- No OAuth or token authentication needed
- Public API with open access

### Rate Limiting
- Automated traffic rate control mechanism exists
- **Specific limits not published**
- Recommendation: Implement client-side throttling (100-500ms between requests)
- Consider caching responses

---

## Data Volume & Freshness

### Coverage
- **Historical data**: 1949 to present
- **Updates**: Daily
- **Total records**: Millions (exact count varies)

### Estimated Daily Volume
- Approximately 50-200 new complaints per day (varies)
- Spikes during recall announcements

---

## Bulk Download Options

### Flat File Downloads
Available at: `https://static.nhtsa.gov/odi/ffdd/`

Files:
- `FLAT_CMPL.zip` - Complete complaints database (CSV format)
- Updated periodically

### SODA Export
- JSON, CSV, XML formats available
- Pagination supported
- Filtering via SoQL queries

---

## Sample API Response

```json
{
  "count": 15,
  "message": "Results returned successfully",
  "results": [
    {
      "odiNumber": "11523456",
      "manufacturer": "TOYOTA MOTOR CORPORATION",
      "crash": "No",
      "fire": "No",
      "numberOfInjured": 0,
      "numberOfDeaths": 0,
      "dateComplaintFiled": "2023-05-15T00:00:00.000",
      "dateofIncident": "2023-04-20T00:00:00.000",
      "vin": "JTDKN3DU5A",
      "component": "AIR BAGS:FRONTAL:DRIVER SIDE",
      "summary": "THE AIRBAG WARNING LIGHT CAME ON WHILE DRIVING. TOOK TO DEALER AND WAS TOLD THE AIRBAG SENSOR WAS FAULTY...",
      "productType": "VEHICLE",
      "modelYear": "2020",
      "make": "TOYOTA",
      "model": "CAMRY"
    }
  ]
}
```

---

## Data Quality Observations

### Strengths
- Comprehensive coverage (1949-present)
- Daily updates
- Rich text descriptions (up to 2048 chars)
- Severity indicators (crash, fire, injuries, deaths)
- Component categorization

### Weaknesses
- Partial VINs only (11 chars)
- Free-text descriptions vary in quality
- Some missing data (year=9999 for unknown)
- No standardized incident classification
- Consumer-reported (unverified)

---

## Implementation Recommendations

### Data Ingestion Strategy

1. **Initial Backfill**
   - Download flat file for historical data
   - Parse and load into PostgreSQL
   - ~1-2 hours for full history

2. **Daily Updates**
   - Use API to fetch complaints by date range
   - Query: `DATEA >= {yesterday}` via SODA
   - Run as scheduled job (daily at midnight)

3. **Deduplication**
   - Primary key: CMPLID
   - Secondary check: ODINO + component combination

### Fields to Index for CaseRadar

**Primary Analysis Fields** (must index):
- MAKETXT, MODELTXT, YEARTXT (pattern grouping)
- COMPDESC (component clustering)
- CRASH, FIRE, INJURED, DEATHS (severity)
- FAILDATE, DATEA (time series)

**Text Embedding Fields**:
- CDESCR (complaint description) → vector embeddings

### API Client Design

```typescript
interface NHTSAClient {
  // Fetch complaints by vehicle
  getComplaintsByVehicle(make: string, model: string, year: number): Promise<Complaint[]>;

  // Fetch complaints by date range (SODA)
  getComplaintsByDateRange(startDate: Date, endDate: Date): Promise<Complaint[]>;

  // Bulk download flat file
  downloadFlatFile(): Promise<string>; // Returns file path
}
```

---

## Decision

**Recommendation**: Use hybrid approach
1. SODA API for daily incremental updates (more flexible queries)
2. Flat file for initial backfill and disaster recovery
3. Implement 500ms throttling between API requests
4. Cache responses for 1 hour

**Data storage**: PostgreSQL with:
- JSON column for raw API response
- Normalized columns for key fields
- pgvector for text embeddings

---

## References

- [NHTSA Datasets and APIs](https://www.nhtsa.gov/nhtsa-datasets-and-apis)
- [ODI Complaints Dataset](https://catalog.data.gov/dataset/nhtsas-office-of-defects-investigation-odi-complaints-nhtsa-api)
- [Complaints Flat File](https://data.transportation.gov/Automobiles/NHTSA-s-Office-of-Defects-Investigation-ODI-Compla/jhit-z9cc)
- [vPIC API Documentation](https://vpic.nhtsa.dot.gov/api/)
- [Data Dictionary (CMPL.txt)](https://static.nhtsa.gov/odi/ffdd/cmpl/CMPL.txt)
