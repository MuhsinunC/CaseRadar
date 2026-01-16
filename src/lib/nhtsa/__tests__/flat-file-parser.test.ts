/**
 * Flat File Parser Tests
 * TDD: These tests are written BEFORE the implementation
 */

import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';

// Import the parser
import {
  parseFlatFileLine,
  parseFlatFileStream,
  mapFlatFileToComplaint,
  FlatFileRecord,
  FLAT_FILE_COLUMNS,
} from '../flat-file-parser';

describe('FlatFileParser', () => {
  describe('FLAT_FILE_COLUMNS', () => {
    it('should define all required column indices', () => {
      // Column indices match the official NHTSA FLAT_CMPL.txt format
      // Based on: https://static.nhtsa.gov/odi/ffdd/cmpl/CMPL.txt
      expect(FLAT_FILE_COLUMNS).toBeDefined();
      expect(FLAT_FILE_COLUMNS.CMPLID).toBe(0);
      expect(FLAT_FILE_COLUMNS.ODINO).toBe(1);
      expect(FLAT_FILE_COLUMNS.MFR_NAME).toBe(2);
      expect(FLAT_FILE_COLUMNS.MAKETXT).toBe(3);
      expect(FLAT_FILE_COLUMNS.MODELTXT).toBe(4);
      expect(FLAT_FILE_COLUMNS.YEARTXT).toBe(5);
      expect(FLAT_FILE_COLUMNS.CRASH).toBe(6);
      expect(FLAT_FILE_COLUMNS.FAILDATE).toBe(7);
      expect(FLAT_FILE_COLUMNS.FIRE).toBe(8);
      expect(FLAT_FILE_COLUMNS.INJURED).toBe(9);
      expect(FLAT_FILE_COLUMNS.DEATHS).toBe(10);
      expect(FLAT_FILE_COLUMNS.COMPDESC).toBe(11);
      expect(FLAT_FILE_COLUMNS.CITY).toBe(12);
      expect(FLAT_FILE_COLUMNS.STATE).toBe(13);
      expect(FLAT_FILE_COLUMNS.VIN).toBe(14);
      expect(FLAT_FILE_COLUMNS.DATEA).toBe(15);
      expect(FLAT_FILE_COLUMNS.LDATE).toBe(16);
      expect(FLAT_FILE_COLUMNS.MILES).toBe(17);
      expect(FLAT_FILE_COLUMNS.OCCURENCES).toBe(18);
      expect(FLAT_FILE_COLUMNS.CDESCR).toBe(19);
    });
  });

  describe('parseFlatFileLine', () => {
    // Test data format: CMPLID, ODINO, MFR_NAME, MAKETXT, MODELTXT, YEARTXT, CRASH, FAILDATE, FIRE,
    //                   INJURED, DEATHS, COMPDESC, CITY, STATE, VIN, DATEA, LDATE, MILES, OCCURENCES, CDESCR

    it('should parse a valid tab-delimited line', () => {
      // Real format from NHTSA flat file (20 fields minimum)
      const line = '1\t958241\tVolvo Car USA, LLC\tVOLVO\t760\t1987\tN\t\tN\t0\t0\tENGINE AND ENGINE COOLING:COOLING SYSTEM:RADIATOR ASSEMBLY\tEL CAJON\tCA\t\t19950103\t19950103\t\t\tRADIATOR FAILED @ HIGHWAY SPEED OBSTRUCTING DRIVERS VISION TEMPORARY.';

      const result = parseFlatFileLine(line);

      expect(result).toBeDefined();
      expect(result?.cmplid).toBe('1');
      expect(result?.odino).toBe('958241');
      expect(result?.mfr_name).toBe('Volvo Car USA, LLC');
      expect(result?.maketxt).toBe('VOLVO');
      expect(result?.modeltxt).toBe('760');
      expect(result?.yeartxt).toBe('1987');
      expect(result?.crash).toBe('N');
      expect(result?.fire).toBe('N');
      expect(result?.injured).toBe('0');
      expect(result?.deaths).toBe('0');
      expect(result?.compdesc).toBe('ENGINE AND ENGINE COOLING:COOLING SYSTEM:RADIATOR ASSEMBLY');
      expect(result?.city).toBe('EL CAJON');
      expect(result?.state).toBe('CA');
      expect(result?.datea).toBe('19950103');
      expect(result?.cdescr).toContain('RADIATOR FAILED');
    });

    it('should handle line with crash and injuries', () => {
      const line = '2\t958132\tKia America, Inc.\tKIA\tSEPHIA\t1994\tY\t19941230\tN\t0\t0\tPOWER TRAIN:AUTOMATIC TRANSMISSION\tSAN FRANCISCO\tCA\t\t19950103\t19950103\t\t1\tSHIFTED INTO REVERSE VEHICLE JERKED VIOLENTLY.';

      const result = parseFlatFileLine(line);

      expect(result).toBeDefined();
      expect(result?.crash).toBe('Y');
      expect(result?.faildate).toBe('19941230');
      expect(result?.occurences).toBe('1');
    });

    it('should handle line with fire and deaths', () => {
      const line = '3\t1234567\tFord Motor Company\tFORD\tPINTO\t1978\tY\t19780601\tY\t2\t1\tFUEL SYSTEM, GASOLINE:STORAGE:TANK ASSEMBLY\tLOS ANGELES\tCA\tABC123\t19780701\t19780701\t50000\t\tFIRE AFTER REAR COLLISION';

      const result = parseFlatFileLine(line);

      expect(result?.fire).toBe('Y');
      expect(result?.deaths).toBe('1');
      expect(result?.injured).toBe('2');
      expect(result?.miles).toBe('50000');
    });

    it('should return null for empty line', () => {
      const result = parseFlatFileLine('');
      expect(result).toBeNull();
    });

    it('should return null for line with insufficient fields', () => {
      const result = parseFlatFileLine('958241\tVolvo\tVOLVO');
      expect(result).toBeNull();
    });

    it('should handle missing optional fields gracefully', () => {
      // Line with empty ODINO, MFR_NAME, FAILDATE, CITY, STATE, VIN, MILES, OCCURENCES
      const line = '4\t\t\tVOLVO\t760\t1987\tN\t\tN\t0\t0\tENGINE\t\t\t\t19950103\t19950103\t\t\tDescription';

      const result = parseFlatFileLine(line);

      expect(result).toBeDefined();
      expect(result?.cmplid).toBe('4');
      expect(result?.odino).toBe('4'); // Falls back to cmplid when ODINO is empty
      expect(result?.mfr_name).toBe('');
      expect(result?.faildate).toBe('');
      expect(result?.vin).toBe('');
      expect(result?.city).toBe('');
      expect(result?.miles).toBe('');
    });

    it('should trim whitespace from all fields', () => {
      const line = '  5  \t  958241  \t  Volvo  \t  VOLVO  \t  760  \t1987\tN\t\tN\t0\t0\tENGINE\tCITY\tCA\t\t19950103\t19950103\t\t\t  Description  ';

      const result = parseFlatFileLine(line);

      expect(result?.cmplid).toBe('5');
      expect(result?.odino).toBe('958241');
      expect(result?.mfr_name).toBe('Volvo');
      expect(result?.cdescr).toBe('Description');
    });
  });

  describe('parseFlatFileStream', () => {
    // Helper to create a valid 20-field line
    const makeLine = (cmplid: string, odino: string, mfr: string, make: string, model: string, year: string, desc: string) =>
      `${cmplid}\t${odino}\t${mfr}\t${make}\t${model}\t${year}\tN\t\tN\t0\t0\tCOMP\tCITY\tST\t\t19950103\t19950103\t\t\t${desc}`;

    it('should parse multiple lines from a stream', async () => {
      const lines = [
        makeLine('1', '958241', 'Volvo', 'VOLVO', '760', '1987', 'Description 1'),
        makeLine('2', '958242', 'Ford', 'FORD', 'MUSTANG', '1990', 'Description 2'),
      ];

      const stream = Readable.from(lines.join('\n'));
      const records: FlatFileRecord[] = [];

      for await (const record of parseFlatFileStream(stream)) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(records[0].cmplid).toBe('1');
      expect(records[1].cmplid).toBe('2');
    });

    it('should skip invalid lines and continue parsing', async () => {
      const lines = [
        makeLine('1', '958241', 'Volvo', 'VOLVO', '760', '1987', 'Description 1'),
        'invalid line with not enough fields',
        '',
        makeLine('3', '958243', 'Honda', 'HONDA', 'ACCORD', '1995', 'Description 3'),
      ];

      const stream = Readable.from(lines.join('\n'));
      const records: FlatFileRecord[] = [];

      for await (const record of parseFlatFileStream(stream)) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(records[0].cmplid).toBe('1');
      expect(records[1].cmplid).toBe('3');
    });

    it('should handle large batches efficiently', async () => {
      // Generate 1000 valid 20-field lines
      const lines: string[] = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(makeLine(`${i + 1}`, `${958241 + i}`, `Mfr${i}`, `MAKE${i}`, `MODEL${i}`, `${1990 + (i % 30)}`, `Description ${i}`));
      }

      const stream = Readable.from(lines.join('\n'));
      const records: FlatFileRecord[] = [];

      for await (const record of parseFlatFileStream(stream)) {
        records.push(record);
      }

      expect(records).toHaveLength(1000);
    });

    it('should emit progress events', async () => {
      const lines = Array(100)
        .fill(null)
        .map((_, i) => makeLine(`${i + 1}`, `${958241 + i}`, 'Mfr', 'MAKE', 'MODEL', '1990', 'Desc'));

      const stream = Readable.from(lines.join('\n'));
      const progressCallback = vi.fn();

      const records: FlatFileRecord[] = [];
      for await (const record of parseFlatFileStream(stream, { onProgress: progressCallback })) {
        records.push(record);
      }

      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('FlatFileRecord to TransformedComplaint mapping', () => {
    it('should correctly map all fields', () => {
      const record: FlatFileRecord = {
        cmplid: '1',
        odino: '958241',
        mfr_name: 'Volvo Car USA, LLC',
        maketxt: 'VOLVO',
        modeltxt: '760',
        yeartxt: '1987',
        crash: 'Y',
        faildate: '19941230',
        fire: 'N',
        injured: '2',
        deaths: '0',
        compdesc: 'ENGINE AND ENGINE COOLING:COOLING SYSTEM',
        city: 'EL CAJON',
        state: 'CA',
        vin: 'ABC123',
        datea: '19950103',
        ldate: '19950103',
        miles: '50000',
        occurences: '1',
        cdescr: 'Radiator failed at highway speed.',
      };

      const complaint = mapFlatFileToComplaint(record);

      expect(complaint.nhtsaId).toBe('1');
      expect(complaint.odiNumber).toBe('958241');
      expect(complaint.manufacturer).toBe('Volvo Car USA, LLC');
      expect(complaint.make).toBe('VOLVO');
      expect(complaint.model).toBe('760');
      expect(complaint.year).toBe(1987);
      expect(complaint.crash).toBe(true);
      expect(complaint.fire).toBe(false);
      expect(complaint.injuries).toBe(2);
      expect(complaint.deaths).toBe(0);
      expect(complaint.component).toBe('ENGINE AND ENGINE COOLING:COOLING SYSTEM');
      expect(complaint.description).toBe('Radiator failed at highway speed.');
      expect(complaint.failDate).toBeInstanceOf(Date);
      expect(complaint.dateAdded).toBeInstanceOf(Date);
    });

    it('should handle invalid year by returning null', () => {
      const record: FlatFileRecord = {
        cmplid: '2',
        odino: '958242',
        mfr_name: 'Tesla',
        maketxt: 'TESLA',
        modeltxt: 'CHARGER',
        yeartxt: '9999', // Invalid year
        crash: 'N',
        faildate: '',
        fire: 'N',
        injured: '0',
        deaths: '0',
        compdesc: 'ELECTRICAL',
        city: '',
        state: '',
        vin: '',
        datea: '20230101',
        ldate: '',
        miles: '',
        occurences: '',
        cdescr: 'Charger malfunction',
      };

      const complaint = mapFlatFileToComplaint(record);

      // Equipment without valid year should have null year
      expect(complaint.year).toBeNull();
    });

    it('should handle empty description', () => {
      const record: FlatFileRecord = {
        cmplid: '3',
        odino: '958243',
        mfr_name: 'Ford',
        maketxt: 'FORD',
        modeltxt: 'F150',
        yeartxt: '2020',
        crash: 'N',
        faildate: '',
        fire: 'N',
        injured: '0',
        deaths: '0',
        compdesc: 'BRAKES',
        city: '',
        state: '',
        vin: '',
        datea: '20230101',
        ldate: '',
        miles: '',
        occurences: '',
        cdescr: '', // Empty description
      };

      const complaint = mapFlatFileToComplaint(record);

      expect(complaint.description).toBe('');
    });
  });
});
