{-# LANGUAGE LambdaCase #-}
{-# LANGUAGE OverloadedStrings #-}

module Effectful.LoggerSpec (spec) where

import Control.Monad.Logger (LogLevel (..), fromLogStr, logDebugN, logInfoN)
import Effectful (runPureEff)
import Effectful.Logger (filterLogger, runWriterLogger)
import Test.Hspec (Spec, describe, it, shouldBe, shouldSatisfy)

spec :: Spec
spec = describe "runWriterLogger" $ do
  it "captures monad-logger messages" $
    snd (runPureEff (runWriterLogger (logInfoN "hello")))
      `shouldSatisfy` \case
        [(_, _, LevelInfo, message)] -> fromLogStr message == "hello"
        _ -> False

  it "filters messages by source and level" $ do
    let logs = snd . runPureEff . runWriterLogger . filterLogger (curry ((/= LevelDebug) . snd)) $ do
          logDebugN "dropped"
          logInfoN "kept"

    length logs `shouldBe` 1
    logs
      `shouldSatisfy` \case
        [(_, _, LevelInfo, message)] -> fromLogStr message == "kept"
        _ -> False
