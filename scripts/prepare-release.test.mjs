import assert from "node:assert/strict";
import test from "node:test";
import { parseHoogle, addSince, isLocalDeclaration } from "./prepare-release.mjs";

test("parseHoogle finds declarations and instances, excluding indirect exports", () => {
  const hoogle = `@package effectful-monad-logger 0.1.1
module Effectful.Logger
type LoggerIO = Loc -> IO ()
runLoggerWith :: IOE :> es => LoggerIO -> Eff (Logger : es) a -> Eff es a
instance MonadLogger (Eff es)
[LoggerLog] :: Loc -> LogSource -> LogLevel -> LogStr -> Logger m ()
class MonadLogger m where {
  monadLoggerLog :: m ()
}
`;
  assert.deepEqual(parseHoogle(hoogle), ["Effectful.Logger.LoggerIO", "Effectful.Logger.MonadLogger", "Effectful.Logger.MonadLogger (Eff es)", "Effectful.Logger.runLoggerWith"]);
});

test("addSince adds an annotation to an existing Haddock block", () => {
  const source = "-- | Runs the logger.\nrunLoggerWith :: LoggerIO -> a\n";
  assert.equal(addSince(source, "runLoggerWith", "0.1.1"), "-- | Runs the logger.\n-- @since 0.1.1\nrunLoggerWith :: LoggerIO -> a\n");
});

test("addSince creates a Haddock block when absent", () => {
  assert.equal(addSince("runLoggerWith :: LoggerIO -> a\n", "runLoggerWith", "0.1.1"), "-- | @since 0.1.1\nrunLoggerWith :: LoggerIO -> a\n");
});

test("addSince locates instances", () => {
  assert.equal(addSince("instance MonadLogger (Eff es)\n", "MonadLogger (Eff es)", "0.1.1"), "-- | @since 0.1.1\ninstance MonadLogger (Eff es)\n");
});

test("re-exported declarations are not local since candidates", () => {
  const source = "module M (module Control.Monad.Logger, runLoggerWith) where\n\nrunLoggerWith :: LoggerIO -> a\n";
  assert.equal(isLocalDeclaration(source, "logInfoN"), false);
  assert.equal(isLocalDeclaration(source, "runLoggerWith"), true);
});
