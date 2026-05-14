# macroscope

A step-by-step **C / C++ macro expansion visualizer**. Paste in any
`#define`s and an invocation, and watch each substitution, stringization,
paste, and rescan happen one token at a time.

Live at **<https://macroscope.orlac.io>**

## What it does

Macroscope implements [Dave Prosser's macro-replacement algorithm](https://www.spinellis.gr/blog/20060626/) — iterative
splicing with per-token hide sets — so it shows expansion exactly the way
a conforming C23 preprocessor performs it (§6.10.5 + §6.10.3.5), including
the trickier cases like `__VA_OPT__`, paint-blocking, and deferred
expansion.

## Examples

### Function-like macros and argument prescan

```c
#define SQUARE(x) ((x) * (x))

SQUARE(3 + 4)
// → ((3 + 4) * (3 + 4))
```

### Stringization (`#`)

```c
#define STR(x) #x

STR(hello world)
// → "hello world"
```

### Token pasting (`##`)

```c
#define CONCAT(a, b) a##b

CONCAT(foo, bar)
// → foobar
```

### Variadic macros and `__VA_OPT__`

```c
#define LOG(fmt, ...) printf(fmt __VA_OPT__(,) __VA_ARGS__)

LOG("hi\n")
// → printf("hi\n")
LOG("%d\n", 42)
// → printf("%d\n", 42)
```

### Deferred expansion (rescan + hide sets)

```c
#define EMPTY
#define DEFER(M) M EMPTY()
#define A() 123

DEFER(A)()
// → A ()      after first scan (A is hide-painted)
// → 123       after rescan
```

This is where most hand-rolled expanders go wrong — macroscope walks the
hide-set bookkeeping token by token so you can see exactly why the second
scan succeeds.

## Scope

This is a **macro-replacement** simulator, not a full preprocessor. It
deliberately doesn't handle:

- conditional compilation (`#if`, `#ifdef`, `#else`, `#elif`, `#endif`)
- `#include`, `#pragma`, `#embed`, `#error`, `#warning`, `#line`
- context-dependent predefined macros (`__FILE__`, `__LINE__`, …)

All such directives are flagged in the live error strip as "not supported".
