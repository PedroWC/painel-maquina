'use strict';

// PTY simulado: registra o que recebe e ecoa a entrada, sem abrir processos reais.

function createFakeSpawn() {
  const spawned = [];

  function spawn(file, args, options) {
    let dataCallback = () => {};
    let exitCallback = () => {};
    const pty = {
      pid: 1000 + spawned.length,
      file,
      args,
      options,
      written: [],
      resized: [],
      killed: false,
      onData: (cb) => {
        dataCallback = cb;
      },
      onExit: (cb) => {
        exitCallback = cb;
      },
      write: (data) => {
        pty.written.push(data);
        dataCallback(`eco:${data}`);
      },
      resize: (cols, rows) => {
        pty.resized.push([cols, rows]);
      },
      kill: () => {
        pty.killed = true;
        exitCallback({ exitCode: 0 });
      },
      emit: (data) => dataCallback(data),
      exit: (code) => exitCallback({ exitCode: code }),
    };
    spawned.push(pty);
    return pty;
  }

  return { spawn, spawned };
}

module.exports = { createFakeSpawn };
