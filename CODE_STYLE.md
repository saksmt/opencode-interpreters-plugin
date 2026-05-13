# Code Style

## Language
- TypeScript with strict mode enabled
- ESNext target

## Naming
- **No prefix conventions**. Symbol names (variables, fields, methods, classes, type aliases) must not use prefixes like `_`, `I`, `T`. The sole exception is private fields that conflict with a getter/setter of the same name — in that case the field uses a leading underscore (e.g. `private _foo: T` backed by `get foo(): T`).
- **No shortened names**. All names must be descriptive and unabbreviated, including local definitions (`const`, `let`). For example, use `maxCharacters` not `maxChars`.
- **No type suffixes in public/exported names**. Type-related suffixes (e.g. `ConfigType`, `StateInterface`) are allowed only in private/local definitions for disambiguation. They are banned in public/exported symbols.
- Functions/methods: camelCase
- Constants: UPPER_SNAKE_CASE
- Types/Interfaces: PascalCase
- Files: kebab-case.ts

## Class Member Order

Within a class, members must appear in this order:

1. **Fields** (private then public, readonly before mutable, with logical grouping)
2. **Static factory methods** (if any)
3. **Constructor**
4. **Public interface methods** (public methods that implement an interface)
5. **Public methods** (including getters/setters)
6. **Private methods** — ordered by their call-stack appearance: the first private method called by the first public method appears first. If a private method `B` calls private method `G`, then `B` appears before `G`. This creates a top-down reading order.

## Type Signatures
- **Public class members require explicit type signatures** (return types for methods/getters, type annotations for properties).
- **Semantic type aliases** are encouraged where bare primitives could be ambiguous (e.g. `type Seconds = number;` instead of plain `number` where seconds are expected).
- **Private method return types** may be omitted but explicit is preferred.
- Use type annotations for function parameters and return types.

## Best Practices
- **Aggressive encapsulation**: Do not expose anything that is not absolutely necessary. Use `private` for class members, avoid `export` on module-level symbols unless consumed externally.
- Avoid comments unless they explain non-obvious reasoning. Do not add redundant "what" comments.
- Use async/await over Promises.
- Prefer const over let.

## Line Width
- Soft limit: 80 characters. Hard limit: 110 characters (enforced by Biome). Prefer breaking lines at the soft limit; the hard limit is a maximum.
