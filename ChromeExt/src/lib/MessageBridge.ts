class _s {
  public foo (bar: string): string {
    return 'bar' + bar;
  }
}

// Global declaration
declare var s: _s;

// Global scope augmentation
var window = window || null;
const _global = (window || global) as any;
_global.s = _s;