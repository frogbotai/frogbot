# `@frogbotai/piece-math-helper`

Perform arithmetic and generate random integers without a configured credential.

## Usage

```ts
import { createMathHelper } from '@frogbotai/piece-math-helper';

export const mathHelper = createMathHelper();
```

## Actions

| Upstream action slug  | Previous wrapper export | Native action          | Notes                                       |
| --------------------- | ----------------------- | ---------------------- | ------------------------------------------- |
| `addition_math`       | `additionMath`          | `addNumbers`           | Adds the two numbers.                       |
| `subtraction_math`    | `subtractionMath`       | `subtractNumbers`      | Subtracts the first number from the second. |
| `multiplication_math` | `multiplicationMath`    | `multiplyNumbers`      | Multiplies the two numbers.                 |
| `division_math`       | `divisionMath`          | `divideNumbers`        | Rejects a zero second number.               |
| `modulo_math`         | `moduloMath`            | `getRemainder`         | Uses JavaScript remainder semantics.        |
| `generateRandom_math` | `generateRandomMath`    | `generateRandomNumber` | Includes both supplied bounds.              |
