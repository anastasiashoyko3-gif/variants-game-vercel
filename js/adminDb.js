class AdminQuery {
  constructor(table){
    this.payload = {table,filters:[],columns:'*'};
  }

  select(columns='*'){
    this.payload.operation = this.payload.operation || 'select';
    this.payload.columns = columns;
    return this;
  }

  insert(values){
    this.payload.operation = 'insert';
    this.payload.values = values;
    return this;
  }

  update(values){
    this.payload.operation = 'update';
    this.payload.values = values;
    return this;
  }

  delete(){
    this.payload.operation = 'delete';
    return this;
  }

  upsert(values,options={}){
    this.payload.operation = 'upsert';
    this.payload.values = values;
    this.payload.upsertOptions = options;
    return this;
  }

  eq(column,value){
    this.payload.filters.push({type:'eq',column,value});
    return this;
  }

  ilike(column,value){
    this.payload.filters.push({type:'ilike',column,value});
    return this;
  }

  order(column,options={}){
    this.payload.order = {column,ascending:options.ascending !== false};
    return this;
  }

  single(){
    this.payload.single = true;
    return this.execute();
  }

  maybeSingle(){
    this.payload.maybeSingle = true;
    return this.execute();
  }

  async execute(){
    const res = await fetch('/api/admin-db',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(this.payload)
    });
    const json = await res.json().catch(()=>({}));

    if(!res.ok){
      return {data:null,error:{message:json.error || 'Admin API error'}};
    }

    return {data:json.data,error:null};
  }

  then(resolve,reject){
    return this.execute().then(resolve,reject);
  }
}

export const adminDb = {
  from(table){
    return new AdminQuery(table);
  }
};
