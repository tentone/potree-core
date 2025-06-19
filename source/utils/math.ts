/**
 * Clamps a number between a minimum and maximum value.
 * 
 * @param value - The number to clamp.
 * @param min - The minimum value the number can be.
 * @param max - The maximum value the number can be.
 * @returns Clamped value between min and max.
 */
export function clamp(value: number, min: number, max: number): number 
{
	return Math.min(Math.max(min, value), max);
}
