import { describe, expect, it } from 'vitest';
import { fechaNegocio, mesNegocio } from '../../src/utils/fecha/fecha.js';

describe('fecha del negocio (America/Bogota)', () => {
  it('a las 10 p. m. en Colombia sigue siendo el mismo día, aunque en UTC ya sea mañana', () => {
    // 2026-11-08 03:00 UTC = 2026-11-07 22:00 en Bogotá
    expect(fechaNegocio(new Date('2026-11-08T03:00:00Z'))).toBe('2026-11-07');
  });

  it('a medianoche de Colombia cambia el día', () => {
    expect(fechaNegocio(new Date('2026-11-08T05:00:00Z'))).toBe('2026-11-08');
  });

  it('el mes se calcula con la hora de Colombia', () => {
    // 1 de diciembre 02:00 UTC = 30 de noviembre 21:00 en Bogotá
    expect(mesNegocio(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11-01');
  });
});
