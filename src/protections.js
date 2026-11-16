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

// Serviços que são o canal de acesso remoto exigem confirmação reforçada (digitar o nome).
const REINFORCED_SERVICES = new Set(['sshd']);
const REINFORCED_OPS = new Set(['stop', 'restart', 'manual', 'disabled', 'delete', 'edit']);

// RN-05: excluir sempre exige digitar o nome; o sshd também em operações que podem derrubá-lo.
function requiresTypedConfirm(name, op) {
  if (op === 'delete') return true;
  return REINFORCED_SERVICES.has(String(name).toLowerCase()) && REINFORCED_OPS.has(op);
}

// Em serviços críticos só é permitido iniciar.
function assertServiceAllowed(name, op) {
  if (isCriticalService(name) && op !== 'start') {
    throw conflict('Serviço crítico do Windows: esta operação não é permitida pelo painel.');
  }
}

// RN-20: processos sem os quais o Windows para ou reinicia. Encerrar qualquer um deles derruba o
// sistema (tela azul ou logoff forçado), então o painel nunca o faz. O svchost entra porque um
// deles pode hospedar serviços essenciais; o caminho seguro é parar o serviço pela aba Serviços.
// Nomes como o Get-Process os mostra (sem .exe), em minúsculas.
const CRITICAL_PROCESSES = [
  'system', 'registry', 'idle', 'system idle process', 'memory compression', 'secure system',
  'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso', 'lsm', 'svchost',
];
const CRITICAL_PROCESS_SET = new Set(CRITICAL_PROCESSES);

function isCriticalProcess(name) {
  return CRITICAL_PROCESS_SET.has(String(name || '').toLowerCase());
}

// RN-04: o processo do painel e os de seus terminais não podem ser encerrados
// pela aba de processos. PIDs 0 a 4 são processos do sistema.
function assertProcessAllowed(pid, protectedPids) {
  if (pid <= 4 || protectedPids.has(pid)) {
    throw conflict('Processo protegido: pertence ao painel ou a um de seus terminais.');
  }
}

module.exports = {
  SELF_TASK,
  CRITICAL_SERVICES,
  CRITICAL_PROCESSES,
  isSelfTask,
  isCriticalService,
  isCriticalProcess,
  requiresTypedConfirm,
  assertTaskAllowed,
  assertServiceAllowed,
  assertProcessAllowed,
};
