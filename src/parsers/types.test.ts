import { describe, expect, it } from 'vitest';
import { splitCsvLine, toDateTime } from './types';

describe('splitCsvLine', () => {
  it('splits simple comma-separated fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps quoted fields containing commas intact', () => {
    expect(splitCsvLine('"a,b",c')).toEqual(['a,b', 'c']);
    expect(splitCsvLine('"SALARY, NET","1,000,000"')).toEqual(['SALARY, NET', '1,000,000']);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(splitCsvLine('"say ""hi""",x')).toEqual(['say "hi"', 'x']);
  });

  it('trims whitespace around unquoted fields', () => {
    expect(splitCsvLine(' a , b ')).toEqual(['a', 'b']);
  });

  it('preserves empty fields (trailing separators matter for column position)', () => {
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c']);
    expect(splitCsvLine('a,b,c,')).toEqual(['a', 'b', 'c', '']);
  });
});

describe('toDateTime', () => {
  it('appends midnight to a bare date', () => {
    expect(toDateTime('2016-01-05')).toBe('2016-01-05 00:00');
  });

  it('leaves a full timestamp unchanged', () => {
    expect(toDateTime('2016-01-05 09:14')).toBe('2016-01-05 09:14');
  });

  it('accepts a custom default time', () => {
    expect(toDateTime('2016-01-05', '12:30')).toBe('2016-01-05 12:30');
  });
});
