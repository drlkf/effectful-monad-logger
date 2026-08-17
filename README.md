# effectful-monad-logger

An `effectful` `Logger` effect compatible with `monad-logger`.

```haskell
import Effectful
import Effectful.Logger

main :: IO ()
main = runEff . runStdoutLogger $ do
  logInfoN "hello"
```

Existing `MonadLogger` code, including the `monad-logger` Template Haskell
splices, works unchanged in an `Eff` stack containing `Logger`.
