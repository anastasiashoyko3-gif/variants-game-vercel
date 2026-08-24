import { neon } from '@neondatabase/serverless';

export const ALLOWED_TABLES = new Set([
  'games','questions','players','answers','votes','points','question_sets','word_events'
]);

export function getDb(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return neon(process.env.DATABASE_URL);
}

function identifier(value){
  if(!/^[a-z_][a-z0-9_]*$/i.test(String(value || ''))) throw new Error('Invalid SQL identifier');
  return `"${value}"`;
}

function selectedColumns(columns='*'){
  if(columns === '*') return '*';
  return String(columns).split(',').map(value=>identifier(value.trim())).join(', ');
}

export async function runQuery(payload){
  const {table,operation,columns='*',values,filters=[],order,single,maybeSingle,upsertOptions={}} = payload || {};
  if(!ALLOWED_TABLES.has(table)) throw new Error('Table is not allowed');
  if(!['select','insert','update','delete','upsert'].includes(operation)) throw new Error('Operation is not allowed');

  const params=[];
  const add=value=>{params.push(value);return `$${params.length}`};
  const where=filters.map(filter=>{
    const column=identifier(filter.column);
    if(filter.type === 'eq') return `${column} = ${add(filter.value)}`;
    if(filter.type === 'ilike') return `${column} ILIKE ${add(filter.value)}`;
    throw new Error('Filter is not allowed');
  });
  const whereSql=where.length ? ` WHERE ${where.join(' AND ')}` : '';
  let query='';

  if(operation === 'select'){
    query=`SELECT ${selectedColumns(columns)} FROM ${identifier(table)}${whereSql}`;
    if(order?.column) query+=` ORDER BY ${identifier(order.column)} ${order.ascending === false ? 'DESC' : 'ASC'}`;
  }

  if(operation === 'insert' || operation === 'upsert'){
    const rows=Array.isArray(values) ? values : [values];
    if(!rows.length || !rows[0] || typeof rows[0] !== 'object') throw new Error('Values are required');
    const keys=Object.keys(rows[0]);
    if(!keys.length || rows.some(row=>keys.some(key=>!(key in row)))) throw new Error('All rows must have the same columns');
    const tuples=rows.map(row=>`(${keys.map(key=>add(row[key])).join(', ')})`).join(', ');
    query=`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(', ')}) VALUES ${tuples}`;
    if(operation === 'upsert'){
      const conflict=String(upsertOptions.onConflict || '').split(',').map(value=>value.trim()).filter(Boolean);
      if(!conflict.length) throw new Error('Upsert conflict columns are required');
      const updates=keys.filter(key=>!conflict.includes(key));
      query+=` ON CONFLICT (${conflict.map(identifier).join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.map(key=>`${identifier(key)} = EXCLUDED.${identifier(key)}`).join(', ')}` : 'NOTHING'}`;
    }
    query+=` RETURNING ${selectedColumns(columns)}`;
  }

  if(operation === 'update'){
    const entries=Object.entries(values || {});
    if(!entries.length) throw new Error('Values are required');
    query=`UPDATE ${identifier(table)} SET ${entries.map(([key,value])=>`${identifier(key)} = ${add(value)}`).join(', ')}${whereSql} RETURNING ${selectedColumns(columns)}`;
  }

  if(operation === 'delete') query=`DELETE FROM ${identifier(table)}${whereSql} RETURNING ${selectedColumns(columns)}`;
  const rows=await getDb().query(query,params);
  if(single && rows.length !== 1) throw new Error(`Expected one row, received ${rows.length}`);
  if(maybeSingle && rows.length > 1) throw new Error(`Expected at most one row, received ${rows.length}`);
  return (single || maybeSingle) ? (rows[0] || null) : rows;
}
