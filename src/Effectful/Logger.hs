{-# LANGUAGE DataKinds #-}
{-# LANGUAGE FlexibleContexts #-}
{-# LANGUAGE FlexibleInstances #-}
{-# LANGUAGE GADTs #-}
{-# LANGUAGE LambdaCase #-}
{-# LANGUAGE TypeFamilies #-}
{-# LANGUAGE TypeOperators #-}
{-# LANGUAGE UndecidableInstances #-}
{-# OPTIONS_GHC -Wno-orphans #-}

module Effectful.Logger (
  module Control.Monad.Logger,
  Logger,
  LoggerIO,
  runLoggerWith,
  runStdoutLogger,
  runStderrLogger,
  runFileLogger,
  runNoLogger,
  runWriterLogger,
  filterLogger,
) where

import Control.Monad.Logger hiding (filterLogger)
import Effectful
import Effectful.Dispatch.Dynamic (interpose, interpret, reinterpret, send)
import Effectful.State.Static.Local (State, modify, runState)
import System.IO (
  BufferMode (LineBuffering),
  IOMode (AppendMode),
  hSetBuffering,
  stderr,
  stdout,
  withFile,
 )

data Logger :: Effect where
  LoggerLog :: Loc -> LogSource -> LogLevel -> LogStr -> Logger m ()
  LoggerAskIO :: Logger m LoggerIO

type LoggerIO =
  Loc
  -> LogSource
  -> LogLevel
  -> LogStr
  -> IO ()

type instance DispatchOf Logger = 'Dynamic

instance Logger :> es => MonadLogger (Eff es) where
  monadLoggerLog loc source level message =
    send (LoggerLog loc source level (toLogStr message))

instance (IOE :> es, Logger :> es) => MonadLoggerIO (Eff es) where
  askLoggerIO = send LoggerAskIO

runLoggerWith
  :: IOE :> es
  => LoggerIO
  -> Eff (Logger : es) a
  -> Eff es a
runLoggerWith logger = interpret $ \_ -> \case
  LoggerLog loc source level message -> liftIO (logger loc source level message)
  LoggerAskIO -> pure logger

runStdoutLogger
  :: IOE :> es
  => Eff (Logger : es) a
  -> Eff es a
runStdoutLogger = runLoggerWith (defaultOutput stdout)

runStderrLogger
  :: IOE :> es
  => Eff (Logger : es) a
  -> Eff es a
runStderrLogger = runLoggerWith (defaultOutput stderr)

runFileLogger
  :: IOE :> es
  => FilePath
  -> Eff (Logger : es) a
  -> Eff es a
runFileLogger path action = withEffToIO SeqUnlift $ \unlift ->
  withFile path AppendMode $ \handle -> do
    hSetBuffering handle LineBuffering
    unlift (runLoggerWith (defaultOutput handle) action)

runNoLogger
  :: Eff (Logger : es) a
  -> Eff es a
runNoLogger = interpret $ \_ -> \case
  LoggerLog{} -> pure ()
  LoggerAskIO -> pure (\_ _ _ _ -> pure ())

runWriterLogger
  :: Eff (Logger : State [LogLine] : es) a
  -> Eff es (a, [LogLine])
runWriterLogger action =
  runState [] $
    reinterpret
      id
      ( \_ -> \case
          LoggerLog loc source level message -> modify (<> [(loc, source, level, message)])
          LoggerAskIO -> pure (\_ _ _ _ -> pure ())
      )
      action

filterLogger
  :: Logger :> es
  => (LogSource -> LogLevel -> Bool)
  -> Eff es a
  -> Eff es a
filterLogger predicate = interpose $ \_ -> \case
  LoggerLog loc source level message
    | predicate source level -> send (LoggerLog loc source level message)
    | otherwise -> pure ()
  LoggerAskIO -> send LoggerAskIO
