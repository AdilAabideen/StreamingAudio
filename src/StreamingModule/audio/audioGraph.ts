declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export class AudioGraph {
    ctx: AudioContext;
    source: MediaStreamAudioSourceNode;
    hp: BiquadFilterNode;
    lp: BiquadFilterNode;
    node: ScriptProcessorNode;
  
    constructor(stream: MediaStream) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.source = this.ctx.createMediaStreamSource(stream);
      this.hp = this.ctx.createBiquadFilter(); this.hp.type = "highpass"; this.hp.frequency.value = 100;
      this.lp = this.ctx.createBiquadFilter(); this.lp.type = "lowpass";  this.lp.frequency.value = 7000;
      this.source.connect(this.hp); this.hp.connect(this.lp);
      this.node = this.ctx.createScriptProcessor(2048, 1, 1);
      this.lp.connect(this.node);
      this.node.connect(this.ctx.destination); // keep graph alive
    }
  
    close() {
      try { this.node.disconnect(); } catch (e) {console.error("Error disconnecting node", e)}
      try { this.lp.disconnect(); } catch (e) {console.error("Error disconnecting lp", e)}
      try { this.hp.disconnect(); } catch (e) {console.error("Error disconnecting hp", e)}
      try { this.source.disconnect(); } catch (e) {console.error("Error disconnecting source", e)}
      return this.ctx.close();
    }
}