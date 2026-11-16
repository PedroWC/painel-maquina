'use strict';

// Recursos protegidos (RF-25): o painel não pode derrubar a si mesmo nem
// serviços essenciais do Windows.

const { HttpError } = require('./validate');

// RN-03: tarefa que mantém o painel em execução.
const SELF_TASK = 'PainelMaquina';
const SELF_TASK_BLOCKED_OPS = new Set(['stop', 'disable', 'delete', 'edit']);

// RN-09: serviços essenciais (comparação sem diferenciar maiúsculas).
const CRITICAL_SERVICES = new Set(
  [
    'RpcSs', 'RpcEptMapper', 'DcomLaunch', 'Winmgmt', 'EventLog', 'LSM', 'SamSs',
    'CryptSvc', 'Dhcp', 'Dnscache', 'BFE', 'mpssvc', 'PlugPlay', 'Power', 'ProfSvc',
    'Schedule', 'SystemEventsBroker', 'TimeBrokerSvc', 'UserManager', 'gpsvc',
    'CoreMessagingRegistrar', 'nsi', 'KeyIso', 'LanmanServer', 'LanmanWorkstation',
  ].map((name) => name.toLowerCase()),
);

const conflict = (message) => new HttpError(409, message);

function isSelfTask(name) {
  return String(name).toLowerCase() === SELF_TASK.toLowerCase();
}

function isCriticalService(name) {
  return CRITICAL_SERVICES.has(String(name).toLowerCase());
}

function assertTaskAllowed(name, op) {
  if (isSelfTask(name) && SELF_TASK_BLOCKED_OPS.has(op)) {
    throw conflict('Tarefa protegida: é a tarefa que mantém o próprio painel em execução.');
  }
}

// Em serviços críticos só é permitido iniciar.
function assertServiceAllowed(name, op) {
  if (isCriticalService(name) && op !== 'start') {
    throw conflict('Serviço crítico do Windows: esta operação não é permitida pelo painel.');
  }
}

// RN-04: o processo do painel e os de seus terminais não podem ser encerrados
// pela aba de processos.
function assertProcessAllowed(pid, protectedPids) {
  if (protectedPids.has(pid)) {
    throw conflict('Processo protegido: pertence ao painel ou a um de seus terminais.');
  }
}

module.exports = {
  SELF_TASK,
  CRITICAL_SERVICES,
  isSelfTask,
  isCriticalService,
  assertTaskAllowed,
  assertServiceAllowed,
  assertProcessAllowed,
};
